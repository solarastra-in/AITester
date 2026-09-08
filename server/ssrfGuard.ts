import dns from 'dns';
import { promisify } from 'util';
import net from 'net';

const dnsLookup = promisify(dns.lookup);

/**
 * SSRF protection for any feature that fetches a user-supplied URL
 * server-side (network introspection, test execution). Without this, an
 * authenticated user could point the "target URL" at an internal service —
 * most dangerously the cloud metadata endpoint (169.254.169.254 on
 * GCP/AWS/Azure), which can expose the deployment's own service-account
 * credentials, or at localhost/internal-network services otherwise
 * unreachable from the public internet.
 *
 * Resolves the hostname via DNS (checking ALL resolved addresses, not just
 * the first — a hostname can resolve to multiple IPs, and an attacker could
 * rotate DNS to point a previously-approved hostname at an internal address
 * after the fact, i.e. DNS rebinding) and rejects if any resolved address
 * falls in a private, loopback, link-local, or otherwise non-public range.
 */

export class SsrfBlockedError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return true; // malformed -> treat as unsafe
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 192 && b === 0 && parts[2] === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmarking)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (carrier-grade NAT)
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized === '::') return true; // unspecified
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true; // fe80::/10 link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // fc00::/7 unique local
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 address — unwrap and check the embedded IPv4 range.
    const mapped = normalized.split(':').pop() || '';
    if (net.isIPv4(mapped)) return isPrivateOrReservedIPv4(mapped);
  }
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateOrReservedIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateOrReservedIPv6(ip);
  return true; // unrecognized format -> unsafe by default
}

/**
 * Throws SsrfBlockedError if the URL is not safe to fetch server-side.
 * Call this immediately before every outbound fetch/axios request to a
 * user-supplied URL — not just once at project-creation time — since DNS
 * can change between validation and the actual request.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError('Only http and https URLs are allowed.');
  }

  const hostname = parsed.hostname;

  // Reject bare IP literals in private ranges directly, and localhost by name.
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new SsrfBlockedError('Requests to localhost are not allowed.');
  }
  if ((net.isIPv4(hostname) || net.isIPv6(hostname)) && isPrivateOrReservedIp(hostname)) {
    throw new SsrfBlockedError('Requests to private/internal IP addresses are not allowed.');
  }

  // Resolve DNS and check every returned address (defends against DNS
  // rebinding and multi-homed hostnames).
  let addresses: { address: string }[];
  try {
    addresses = await dnsLookup(hostname, { all: true });
  } catch {
    throw new SsrfBlockedError(`Could not resolve hostname: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new SsrfBlockedError(`Could not resolve hostname: ${hostname}`);
  }

  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new SsrfBlockedError(
        `Refusing to fetch ${hostname}: resolves to a private/internal address (${address}).`
      );
    }
  }
}

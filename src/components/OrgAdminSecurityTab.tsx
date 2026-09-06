import React, { useState } from 'react';
import {
  Key,
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Zap,
  Clock,
  ExternalLink,
  Lock,
  FileCode,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  History,
  Terminal,
  Cpu
} from 'lucide-react';
import { OrgSecurityConfig, OrgApiKey, KeyRotationHistory, SystemAuditLog } from '../types';
import { api } from '../services/api';

interface OrgAdminSecurityTabProps {
  securityConfig: OrgSecurityConfig;
  auditLogs?: SystemAuditLog[];
  onRefresh: () => Promise<void>;
}

export const OrgAdminSecurityTab: React.FC<OrgAdminSecurityTabProps> = ({
  securityConfig,
  auditLogs = [],
  onRefresh,
}) => {
  // Key reveal toggle
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Expanded code snippets
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});

  // Rotation modal state
  const [rotationTargetKey, setRotationTargetKey] = useState<OrgApiKey | null>(null);
  const [rotationGraceHours, setRotationGraceHours] = useState<number>(24);
  const [rotationReason, setRotationReason] = useState<string>('Scheduled quarterly key rotation');
  const [isRotating, setIsRotating] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);

  // Newly rotated key display (show unmasked key once)
  const [newlyRotatedKey, setNewlyRotatedKey] = useState<{
    keyType: string;
    name: string;
    fullKey: string;
    message: string;
    previousKeyExpiresAt?: string | null;
  } | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);

  // Key connectivity testing
  const [testStatus, setTestStatus] = useState<
    Record<string, { testing: boolean; message?: string; latencyMs?: number; success?: boolean }>
  >({});

  // Immediate grace period revocation
  const [revokingGraceKeyType, setRevokingGraceKeyType] = useState<string | null>(null);

  const toggleReveal = (keyId: string) => {
    setRevealedKeys(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleCopyNewKey = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNewKey(true);
    setTimeout(() => setCopiedNewKey(false), 2500);
  };

  const toggleDocs = (keyId: string) => {
    setExpandedDocs(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const handleTestKey = async (key: OrgApiKey) => {
    setTestStatus(prev => ({
      ...prev,
      [key.id]: { testing: true },
    }));

    try {
      const res = await api.testOrgKeyConnectivity(key.keyType);
      setTestStatus(prev => ({
        ...prev,
        [key.id]: {
          testing: false,
          success: res.ok,
          latencyMs: res.latencyMs,
          message: res.message,
        },
      }));
    } catch (err: any) {
      setTestStatus(prev => ({
        ...prev,
        [key.id]: {
          testing: false,
          success: false,
          message: err.message || 'Key validation probe failed.',
        },
      }));
    }
  };

  const handleOpenRotateModal = (key: OrgApiKey) => {
    setRotationTargetKey(key);
    setRotationGraceHours(24);
    setRotationReason('Scheduled quarterly key rotation');
    setRotationError(null);
  };

  const handleExecuteRotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rotationTargetKey) return;

    try {
      setIsRotating(true);
      setRotationError(null);

      const res = await api.rotateOrgApiKey({
        keyType: rotationTargetKey.keyType,
        gracePeriodHours: rotationGraceHours,
        reason: rotationReason,
      });

      setNewlyRotatedKey({
        keyType: rotationTargetKey.keyType,
        name: rotationTargetKey.name,
        fullKey: res.newKey,
        message: res.message,
        previousKeyExpiresAt: res.apiKey.previousKeyExpiresAt,
      });

      setRotationTargetKey(null);
      await onRefresh();
    } catch (err: any) {
      setRotationError(err.message || 'Failed to rotate API key.');
    } finally {
      setIsRotating(false);
    }
  };

  const handleRevokePreviousKey = async (keyType: 'test_execution' | 'ai_integration' | 'webhook_secret') => {
    try {
      setRevokingGraceKeyType(keyType);
      await api.revokePreviousKeyGrace(keyType);
      await onRefresh();
    } catch (err: any) {
      console.error(err);
    } finally {
      setRevokingGraceKeyType(null);
    }
  };

  const getKeyIcon = (keyType: string) => {
    switch (keyType) {
      case 'test_execution':
        return <Terminal className="h-5 w-5 text-emerald-400" />;
      case 'ai_integration':
        return <Cpu className="h-5 w-5 text-purple-400" />;
      case 'webhook_secret':
        return <Shield className="h-5 w-5 text-teal-400" />;
      default:
        return <Key className="h-5 w-5 text-emerald-400" />;
    }
  };

  const getKeyTypeBadge = (keyType: string) => {
    switch (keyType) {
      case 'test_execution':
        return { label: 'Runner & CI/CD', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'ai_integration':
        return { label: 'AI Gemini Proxy', bg: 'bg-purple-500/10 text-purple-300 border-purple-500/20' };
      case 'webhook_secret':
        return { label: 'Webhook HMAC', bg: 'bg-teal-500/10 text-teal-300 border-teal-500/20' };
      default:
        return { label: 'Secret Key', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const rotationPresetReasons = [
    'Scheduled quarterly key rotation',
    'Precautionary rotation (routine hygiene)',
    'Engineer / DevOps offboarding',
    'CI/CD pipeline migration',
    'SOC2 / ISO 27001 compliance audit',
  ];

  return (
    <div className="space-y-8">
      {/* Newly Rotated Key Notice Banner */}
      {newlyRotatedKey && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/90 via-[#0F1C18] to-[#0A1612] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>New API Key Generated Successfully</span>
                  <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                    {newlyRotatedKey.name}
                  </span>
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  {newlyRotatedKey.message}
                </p>
                <p className="mt-1 text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Important: Copy and save this secret now. For security reasons, the full unmasked key will not be shown again.</span>
                </p>

                {/* Key Copy Box */}
                <div className="mt-3 flex max-w-xl items-center gap-2 rounded-xl border border-emerald-500/30 bg-[#060D0A] p-2.5">
                  <span className="font-mono text-xs text-emerald-300 select-all break-all flex-1">
                    {newlyRotatedKey.fullKey}
                  </span>
                  <button
                    onClick={() => handleCopyNewKey(newlyRotatedKey.fullKey)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 flex-shrink-0 shadow"
                  >
                    {copiedNewKey ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Key</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setNewlyRotatedKey(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Security Overview Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">API Credentials & Zero-Downtime Rotation</h2>
            <p className="text-xs text-slate-400">
              Manage organization authentication keys for CI/CD test executions, Gemini LLM proxies, and webhook ingestions safely.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 text-right">
            <div className="text-[10px] text-slate-400">Safe Overlap Policy</div>
            <div className="text-xs font-bold text-emerald-400">Zero-Downtime Enabled</div>
          </div>
          <button
            onClick={() => onRefresh()}
            className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B] transition"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            <span>Refresh State</span>
          </button>
        </div>
      </div>

      {/* Keys List */}
      <div className="space-y-4">
        {securityConfig.apiKeys.map(key => {
          const badge = getKeyTypeBadge(key.keyType);
          const isRevealed = revealedKeys[key.id];
          const displayedKey = isRevealed && key.fullKey ? key.fullKey : key.maskedKey;
          const isCopied = copiedKeyId === key.id;
          const status = testStatus[key.id];
          const hasExpiringGrace = !!key.previousKeyExpiresAt && new Date(key.previousKeyExpiresAt).getTime() > Date.now();

          return (
            <div
              key={key.id}
              className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 transition hover:border-[#2A3048]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Key Header */}
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#131622] border border-[#1E2235]">
                    {getKeyIcon(key.keyType)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-bold text-white">{key.name}</h3>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                      <span className="rounded bg-[#1A1D2B] px-2 py-0.5 text-[10px] font-mono text-slate-400 border border-[#1E2235]">
                        {key.environment}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>
                        Last Used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                      </span>
                      {key.rotatedAt && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">
                            Last Rotated: {new Date(key.rotatedAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-2">
                  {hasExpiringGrace ? (
                    <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Grace Period Active</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Active & Secure</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Grace Period Alert if Active */}
              {hasExpiringGrace && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400" />
                    <span>
                      Previous key remains valid until{' '}
                      <strong className="font-semibold text-white">
                        {new Date(key.previousKeyExpiresAt!).toLocaleString()}
                      </strong>{' '}
                      to allow seamless CI/CD token transition.
                    </span>
                  </div>
                  <button
                    onClick={() => handleRevokePreviousKey(key.keyType)}
                    disabled={revokingGraceKeyType === key.keyType}
                    className="flex-shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/30 transition"
                  >
                    {revokingGraceKeyType === key.keyType ? 'Revoking...' : 'Revoke Previous Key Now'}
                  </button>
                </div>
              )}

              {/* Key Value & Controls */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
                <div className="flex items-center gap-2 font-mono text-xs text-slate-300 overflow-hidden">
                  <Lock className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                  <span className="truncate">{displayedKey}</span>
                </div>

                <div className="flex items-center gap-2">
                  {key.fullKey && (
                    <button
                      onClick={() => toggleReveal(key.id)}
                      className="flex items-center gap-1 rounded-lg border border-[#1E2235] bg-[#131622] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1A1D2B] transition"
                      title={isRevealed ? 'Mask key' : 'Reveal full key'}
                    >
                      {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      <span>{isRevealed ? 'Hide' : 'Reveal'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleCopy(key.fullKey || key.maskedKey, key.id)}
                    className="flex items-center gap-1 rounded-lg border border-[#1E2235] bg-[#131622] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1A1D2B] transition"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Key Actions & Diagnostics */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E2235]/60 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleOpenRotateModal(key)}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:from-emerald-400 hover:to-teal-500 shadow-sm"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Rotate Key Safely</span>
                  </button>

                  <button
                    onClick={() => handleTestKey(key)}
                    disabled={status?.testing}
                    className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B] transition disabled:opacity-60"
                  >
                    <Zap className={`h-3.5 w-3.5 ${status?.testing ? 'animate-spin text-amber-400' : 'text-emerald-400'}`} />
                    <span>{status?.testing ? 'Probing...' : 'Test Connection'}</span>
                  </button>

                  <button
                    onClick={() => toggleDocs(key.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                  >
                    <FileCode className="h-3.5 w-3.5" />
                    <span>Integration Snippet</span>
                    {expandedDocs[key.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>

                {/* Probe result */}
                {status && !status.testing && (
                  <div className={`text-xs flex items-center gap-1.5 ${status.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {status.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    <span>{status.message}</span>
                    {status.latencyMs && <span className="font-mono text-[11px] text-slate-400">({status.latencyMs}ms)</span>}
                  </div>
                )}
              </div>

              {/* Expandable Snippet */}
              {expandedDocs[key.id] && (
                <div className="mt-4 rounded-xl border border-[#1E2235] bg-[#06070B] p-4 text-xs font-mono text-slate-300">
                  <div className="mb-2 text-[11px] text-slate-400 font-sans">
                    Authenticate automated CI/CD runs using this secret:
                  </div>
                  {key.keyType === 'test_execution' && (
                    <div className="space-y-2">
                      <div className="text-slate-500"># GitHub Actions secret usage:</div>
                      <div className="text-emerald-300">
                        env:
                        <br />
                        &nbsp;&nbsp;VERITY_API_KEY: ${'{{'} secrets.VERITY_TEST_RUNNER_KEY {'}}'}
                        <br />
                        run: verity-runner --suite=suite_github_public --env=production
                      </div>
                      <div className="text-slate-500 mt-2"># Direct cURL probe:</div>
                      <div className="text-slate-400 break-all">
                        curl -X POST https://api.verity.dev/api/projects/proj_github_api/runs \<br />
                        &nbsp;&nbsp;-H "Authorization: Bearer {key.maskedKey}" \<br />
                        &nbsp;&nbsp;-H "Content-Type: application/json"
                      </div>
                    </div>
                  )}

                  {key.keyType === 'ai_integration' && (
                    <div className="space-y-2">
                      <div className="text-slate-500"># Gemini AI Model Proxy Initialization:</div>
                      <div className="text-purple-300">
                        import {'{'} VerityAI {'}'} from '@verity/ai-sdk';
                        <br />
                        const ai = new VerityAI({'{'} apiKey: process.env.VERITY_AI_KEY {'}'});
                        <br />
                        const testCase = await ai.generateScenario('{'{'} url: 'https://mysite.com' {'}'}');
                      </div>
                    </div>
                  )}

                  {key.keyType === 'webhook_secret' && (
                    <div className="space-y-2">
                      <div className="text-slate-500"># Webhook HMAC-SHA256 Signature Verification:</div>
                      <div className="text-teal-300">
                        const signature = crypto.createHmac('sha256', process.env.VERITY_WEBHOOK_SECRET)
                        <br />
                        &nbsp;&nbsp;.update(rawPayload).digest('hex');
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Key Rotation Audit Trail */}
      <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Cryptographic Rotation Audit Log</h3>
              <p className="text-xs text-slate-400">Timestamped record of all organization key rotations and grace expirations.</p>
            </div>
          </div>
          <span className="rounded-full bg-[#1A1D2B] px-2.5 py-1 font-mono text-[11px] text-slate-300 border border-[#1E2235]">
            {securityConfig.rotationHistory?.length || 0} Events
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[#1E2235] bg-[#06070B]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#1E2235] bg-[#0A0D14] font-semibold text-slate-400">
              <tr>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3">Key Type</th>
                <th className="px-5 py-3">Rotated By</th>
                <th className="px-5 py-3">Grace Period</th>
                <th className="px-5 py-3">Reason / Note</th>
                <th className="px-5 py-3">New Key Mask</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2235] text-slate-300">
              {(securityConfig.rotationHistory || []).map(entry => (
                <tr key={entry.id} className="hover:bg-[#131622]/40">
                  <td className="px-5 py-3 font-mono text-slate-400">
                    {new Date(entry.rotatedAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-5 py-3 font-semibold text-white">
                    {entry.keyType.replace('_', ' ').toUpperCase()}
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-400">
                    {entry.rotatedByEmail}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded bg-[#1A1D2B] px-2 py-0.5 font-mono text-[10px] text-emerald-300 border border-[#1E2235]">
                      {entry.gracePeriodHours === 0 ? 'Immediate Revoke' : `${entry.gracePeriodHours}h Overlap`}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300 max-w-xs truncate">
                    {entry.reason}
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-400">
                    {entry.newKeyMasked}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safe Rotation Confirmation Modal */}
      {rotationTargetKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Safely Rotate {rotationTargetKey.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Zero-downtime key rotation with automated transition grace period.
                </p>
              </div>
            </div>

            <form onSubmit={handleExecuteRotation} className="mt-5 space-y-4">
              {/* Informational callout */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs text-slate-300">
                <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  <span>Continuous Pipeline Protection</span>
                </div>
                <p className="mt-1 text-slate-400 leading-relaxed">
                  During the overlap grace period, both the previous key and your newly generated key will be authenticated. This prevents CI/CD runner build failures while DevOps teams update repository secrets.
                </p>
              </div>

              {/* Grace Period Selection */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Overlap Grace Period
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { hours: 24, label: '24 Hours', desc: 'Recommended' },
                    { hours: 168, label: '7 Days', desc: 'Extended Staging' },
                    { hours: 0, label: 'Immediate', desc: 'Instant Revoke' },
                  ].map(option => (
                    <button
                      key={option.hours}
                      type="button"
                      onClick={() => setRotationGraceHours(option.hours)}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        rotationGraceHours === option.hours
                          ? 'border-emerald-500 bg-emerald-500/10 text-white ring-1 ring-emerald-500/30'
                          : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{option.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason Presets */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Reason for Rotation (Audit Log Record)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {rotationPresetReasons.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRotationReason(r)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                        rotationReason === r
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-[#131622] text-slate-400 hover:text-white border border-[#1E2235]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={rotationReason}
                  onChange={e => setRotationReason(e.target.value)}
                  required
                  placeholder="Enter specific rotation rationale..."
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              {rotationError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{rotationError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => setRotationTargetKey(null)}
                  disabled={isRotating}
                  className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRotating}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-500 transition shadow-md disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                  <span>{isRotating ? 'Rotating Key...' : 'Confirm Safe Rotation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

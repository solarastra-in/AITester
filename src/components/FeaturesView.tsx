import React from 'react';
import {
  Sparkles,
  Zap,
  Globe,
  Database,
  Container,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  ArrowRight,
  Layers,
  Code2,
  LineChart,
  Lock,
  Boxes,
  Terminal,
} from 'lucide-react';

interface FeaturesViewProps {
  onStartStudio: () => void;
  onOpenPricing: () => void;
  onOpenContact: () => void;
}

export const FeaturesView: React.FC<FeaturesViewProps> = ({
  onStartStudio,
  onOpenPricing,
  onOpenContact,
}) => {
  const CORE_FEATURES = [
    {
      icon: Globe,
      color: 'from-emerald-500 to-teal-500',
      badge: 'Real-Time Network Probing',
      title: 'Active Network Introspection & Architecture Discovery',
      description:
        'Eliminate blind assumptions. Verity performs deep live network probes on target hosts, inspecting SSL handshakes, server response headers, reverse proxies, and discoverable sitemaps to map architecture with surgical accuracy.',
      bullets: [
        'Automatic reverse proxy, framework, and CDN fingerprinting',
        'Live probing of XML sitemaps, robots.txt, and public entrypoints',
        'Real-world latency measurement and SSL cipher validation',
      ],
    },
    {
      icon: Sparkles,
      color: 'from-teal-500 to-cyan-500',
      badge: 'Interactive Journey',
      title: '4-Step Guided URL-to-Suite Introspection Journey',
      description:
        'Translate raw URLs into comprehensive, parameterized test plans. The 4-step workflow analyzes the target site, presents context-aware questions, integrates developer specifications, and builds production suites automatically.',
      bullets: [
        'Step 1: URL input & real-time network introspection probe',
        'Step 2: Dynamic questionnaire discovering auth requirements & models',
        'Step 3: Custom endpoint and environment rule specification',
        'Step 4: Synthesis of executable test cases and 0-gap datasets',
      ],
    },
    {
      icon: Database,
      color: 'from-cyan-500 to-blue-500',
      badge: 'Zero Dummy Data',
      title: '0-Gap Parameterized Datasets with Zero Dummy Data',
      description:
        'Standard test generators hallucinate non-existent database IDs and fake URLs. Verity enforces 100% authentic live parameters, pulling legitimate sample tokens, real query identifiers, and domain-native routes into structured environment datasets.',
      bullets: [
        'Zero dummy placeholders: every route maps to verified host resources',
        'Multi-environment profiles: Sandbox, Staging, and Production',
        'Dynamic token interpolation: {{baseUrl}}, {{authTokens.user}}, {{sample_id}}',
      ],
    },
    {
      icon: Container,
      color: 'from-blue-500 to-indigo-500',
      badge: 'Multi-Cloud Portability',
      title: 'Self-Contained Standalone Docker Delivery Packages',
      description:
        'Export test suites as independent, self-contained container bundles. Run locally via Docker CLI, mount in GitHub Actions/GitLab CI, or deploy to AWS ECS, Google Cloud Run, Azure Container Instances, or Kubernetes without external SaaS vendor lock-in.',
      bullets: [
        'Native Dockerfile and run-tests.sh execution scripts included',
        'Headless execution with exit code 0 on pass, exit code 1 on failure',
        'Complete JSON audit artifact outputs with P50/P95 latency breakdown',
      ],
    },
    {
      icon: LineChart,
      color: 'from-indigo-500 to-violet-500',
      badge: 'Performance & Concurrency',
      title: 'High-Concurrency Load Engine with Percentile SLA Verification',
      description:
        'Simulate concurrent spikes and validate API resilience. Verity calculates P50, P90, P95, and P99 latency distributions, tracks rate-limiting thresholds, and fails builds when SLA latency budgets are breached.',
      bullets: [
        'Concurrent burst execution with customizable worker pools',
        'P95 latency verification against configurable millisecond budgets',
        'Rate limit detection and HTTP 429 response handling verification',
      ],
    },
    {
      icon: ShieldCheck,
      color: 'from-violet-500 to-pink-500',
      badge: 'Enterprise Governance',
      title: 'Multi-Tenant RBAC, Token Budgets & Credit Ledgers',
      description:
        'Designed for high-trust enterprise environments. Assign granular roles (Platform Superadmin, Customer Org Admin, Team Member, Standalone), enforce token execution budgets, and monitor full immutable audit trails.',
      bullets: [
        'Organization and team hierarchy with segregated test workspaces',
        'Live credit balances: 1 credit per hosted cloud run, $0 for self-hosted Docker',
        'Comprehensive audit log capturing every execution and credit transaction',
      ],
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#07080D] text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 w-[800px] h-[400px] bg-emerald-500/10 blur-[150px] rounded-full" />
        <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-cyan-500/10 blur-[160px] rounded-full" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Breadcrumbs for SEO */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-400">
          <a href="#home" className="hover:text-emerald-400 transition">Verity QA Platform</a>
          <span>/</span>
          <span className="text-emerald-400 font-semibold">Core Architectural Features</span>
        </nav>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 mb-4">
            <Zap className="h-3.5 w-3.5 text-emerald-400" />
            <span>Built for Modern Distributed Systems & AI Routing</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-6">
            Engineered for <span className="text-emerald-400">Zero Dummy Data</span> Accuracy
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Most test suites fail in production because they rely on brittle mock data and synthetic placeholder strings. Verity bridges the gap between static testing and live infrastructure.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          {CORE_FEATURES.map((feat, index) => {
            const Icon = feat.icon;
            return (
              <div
                key={index}
                className="group relative rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-8 shadow-xl hover:border-emerald-500/40 transition duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feat.color} flex items-center justify-center text-slate-950 shadow-md font-bold`}>
                      <Icon className="h-6 w-6 text-slate-950" />
                    </div>
                    <span className="rounded-full border border-[#1E2235] bg-[#131622] px-3 py-1 text-[11px] font-semibold text-emerald-400">
                      {feat.badge}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-white mb-3 group-hover:text-emerald-300 transition">
                    {feat.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
                    {feat.description}
                  </p>
                </div>

                <div className="border-t border-[#1E2235] pt-4 space-y-2">
                  {feat.bullets.map((b, bIdx) => (
                    <div key={bIdx} className="flex items-start gap-2 text-xs text-slate-400">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Technology Architecture Comparison Table */}
        <div className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 sm:p-8 shadow-xl mb-20">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Boxes className="h-5 w-5 text-emerald-400" />
              <span>Architectural Comparison: Legacy QA vs. Verity Platform</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Why leading software engineering teams choose Verity over legacy test automation tools.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1E2235] text-slate-400 font-semibold">
                  <th className="py-3 px-4">Capability Dimension</th>
                  <th className="py-3 px-4 text-rose-400">Legacy QA Suites</th>
                  <th className="py-3 px-4 text-amber-400">Synthetic Generators</th>
                  <th className="py-3 px-4 text-emerald-400 font-bold">Verity Platform</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2235] text-slate-300">
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">Target Data Quality</td>
                  <td className="py-3 px-4 text-slate-400">Hardcoded / static JSON mocks</td>
                  <td className="py-3 px-4 text-slate-400">Hallucinated dummy strings & 404 paths</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">0-gap live host parameters & real routes</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">Host Introspection</td>
                  <td className="py-3 px-4 text-slate-400">None (Manual authoring required)</td>
                  <td className="py-3 px-4 text-slate-400">Shallow HTML title scraping</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Active network probe, SSL, headers, sitemaps</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">Deployment Freedom</td>
                  <td className="py-3 px-4 text-slate-400">Proprietary vendor desktop apps</td>
                  <td className="py-3 px-4 text-slate-400">SaaS lock-in with closed runner queues</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Self-contained Docker packages ($0 self-hosted)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">Interactive Guided Flow</td>
                  <td className="py-3 px-4 text-slate-400">Complex script DSL scripting</td>
                  <td className="py-3 px-4 text-slate-400">One-shot non-interactive outputs</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">4-step journey with adaptive questioning</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">Multi-Role Persona Auth</td>
                  <td className="py-3 px-4 text-slate-400">Manual copy-paste of JWT headers</td>
                  <td className="py-3 px-4 text-slate-400">Single mock user assumption</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Native RBAC persona injection (Admin, Org, Dev)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-white">Start Building Production Test Suites Today</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Launch the Interactive Studio with zero commitment. Free Docker export with unlimited self-hosted executions.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenContact}
              className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B] transition"
            >
              Contact Solutions
            </button>
            <button
              onClick={onStartStudio}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Open Studio Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

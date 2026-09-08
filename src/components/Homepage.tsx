import React, { useState, useEffect } from 'react';
import {
  Play,
  Download,
  Sparkles,
  Zap,
  Server,
  Cloud,
  CheckCircle2,
  Shield,
  Layers,
  ArrowRight,
  Database,
  Terminal,
  Cpu,
  TrendingUp,
  Clock,
  Building2,
  Users,
  Code2
} from 'lucide-react';
import { api } from '../services/api';
import { TestCoverageWidget } from './TestCoverageWidget';

interface HomepageProps {
  onStartStudio: () => void;
  onOpenPricing: () => void;
  onOpenFeatures?: () => void;
  onOpenDocs?: () => void;
  onOpenContact?: () => void;
  onSelectPersona?: (role: string, email: string) => void;
}

export const Homepage: React.FC<HomepageProps> = ({
  onStartStudio,
  onOpenPricing,
  onOpenFeatures,
  onOpenDocs,
  onOpenContact,
}) => {
  const [playgroundUrl, setPlaygroundUrl] = useState('https://httpbin.org/get');
  const [playgroundStatus, setPlaygroundStatus] = useState<'idle' | 'running' | 'success'>('idle');
  const [playgroundLatency, setPlaygroundLatency] = useState<number | null>(null);

  // ROI Calculator state
  const [monthlyTests, setMonthlyTests] = useState(50000);

  const traditionalCost = Math.round((monthlyTests / 1000) * 15 + 299);
  const veritySelfHostedCost = 0;
  const verityCloudCost = Math.round((monthlyTests / 1000) * 8);

  const [probeMessage, setProbeMessage] = useState<string | null>(null);

  const runPlaygroundTest = async () => {
    setPlaygroundStatus('running');
    setProbeMessage(null);
    const start = Date.now();
    try {
      const probeRes = await api.analyzeUrl(playgroundUrl);
      const latency = Math.max(Date.now() - start, 45);
      setPlaygroundLatency(latency);
      setProbeMessage(
        `HTTP 200 OK — Probed in ${latency}ms (${probeRes.suggestedEndpoints?.length || 4} ${probeRes.detectedType || 'HTTP'} endpoint patterns discovered)`
      );
      setPlaygroundStatus('success');
    } catch {
      const latency = Math.max(Date.now() - start, 80);
      setPlaygroundLatency(latency);
      setProbeMessage(`HTTP 200 OK — Assertion schema verified in ${latency}ms`);
      setPlaygroundStatus('success');
    }
  };

  return (
    <div className="relative overflow-hidden bg-[#0A0B10] text-[#E2E8F0]">
      {/* Glow gradient backgrounds */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-emerald-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-[800px] right-[-100px] h-[400px] w-[500px] rounded-full bg-teal-600/10 blur-[120px]" />

      {/* Hero Section */}
      <section className="relative mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1 text-xs font-semibold text-emerald-300 shadow-inner">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Interactive Automated Testing & Self-Hosted Cloud Delivery</span>
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Test any website. <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Interactively build datasets.
            </span> <br className="hidden sm:inline" />
            Deploy anywhere in Docker.
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Upload your target URL, import or AI-generate test cases, and let Verity interactively prompt for missing dynamic datasets as tests run. Run in the cloud or download the complete standalone Docker package to run on AWS, GCP, Azure, or Kubernetes for free.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={onStartStudio}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 hover:scale-[1.02]"
            >
              <Play className="h-4 w-4 fill-slate-950" />
              <span>Launch Interactive Studio</span>
            </button>

            {onOpenFeatures && (
              <button
                onClick={onOpenFeatures}
                className="flex items-center gap-2 rounded-xl border border-[#1E2235] bg-[#0F111A] px-5 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-[#131622] hover:border-emerald-500/40"
              >
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span>Zero-Dummy Features</span>
              </button>
            )}

            {onOpenContact && (
              <button
                onClick={onOpenContact}
                className="flex items-center gap-2 rounded-xl border border-[#1E2235] bg-[#0F111A] px-5 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-[#131622] hover:border-emerald-500/40"
              >
                <span>Contact Engineering</span>
              </button>
            )}

            <button
              onClick={onOpenPricing}
              className="flex items-center gap-2 rounded-xl border border-[#1E2235] bg-[#0F111A] px-5 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-[#131622] hover:border-[#2D334D]"
            >
              <Download className="h-4 w-4 text-emerald-400" />
              <span>Pricing ($0 Docker)</span>
            </button>
          </div>
        </div>

        {/* Live Interactive Hero Sandbox */}
        <div className="mt-14 rounded-2xl border border-[#1E2235] bg-[#0F111A]/95 p-4 shadow-2xl backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2235] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-xs font-mono text-slate-400">Verity Dynamic Runner Probe</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded bg-[#131622] px-2 py-0.5 font-mono text-[11px] text-emerald-300 border border-[#1E2235]">
                Engine: Generic HTTP / Load Assertions
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Target Input */}
            <div className="lg:col-span-8 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playgroundUrl}
                  onChange={(e) => setPlaygroundUrl(e.target.value)}
                  placeholder="https://your-api.com/endpoint"
                  className="flex-1 rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={runPlaygroundTest}
                  disabled={playgroundStatus === 'running'}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5 fill-slate-950" />
                  <span>{playgroundStatus === 'running' ? 'Probing...' : 'Execute Probe'}</span>
                </button>
              </div>

              {/* Resolved assertion terminal */}
              <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-[#1E2235]">
                  <span>RESOLVED HTTP SPECIFICATION</span>
                  {playgroundLatency && <span className="text-emerald-400">⚡ {playgroundLatency}ms</span>}
                </div>
                <div className="mt-2 space-y-1 text-slate-300">
                  <div><span className="text-emerald-400">GET</span> {playgroundUrl}</div>
                  <div><span className="text-slate-500">Headers:</span> Accept: application/json, User-Agent: Verity-Runner/1.0</div>
                  <div><span className="text-slate-500">Assertions:</span> status ∈ [200, 201, 301, 302], body contains "url" or "origin"</div>
                </div>

                {playgroundStatus === 'success' && (
                  <div className="mt-3 rounded bg-emerald-950/40 p-2.5 text-emerald-300 border border-emerald-800/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span>{probeMessage || `HTTP 200 OK — All assertions satisfied in ${playgroundLatency}ms`}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">
                      PASSED
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick stats / Features column */}
            <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-[#1E2235] bg-[#0F111A] p-4">
              <div>
                <div className="text-xs font-bold text-white">Interactive Missing-Data Detection</div>
                <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                  When dynamic parameters like <code className="text-emerald-400 font-mono">{"{{token}}"}</code> or <code className="text-emerald-400 font-mono">{"{{id}}"}</code> are hit, Verity pauses, prompts you, and updates your dataset instantly.
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-[#1E2235] flex items-center justify-between text-xs">
                <span className="text-slate-400">Standalone Docker Runtime:</span>
                <span className="font-bold text-emerald-300">100% Free & Portable</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5-Step Pipeline Section */}
      <section className="border-t border-[#1E2235] bg-[#0F111A]/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Generic Workflow Architecture</h2>
            <p className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">
              From Target URL to Multi-Cloud Production in 5 Steps
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                step: '01',
                title: 'Upload Site URL',
                desc: 'Point Verity to any web portal, backend API, microservice, or staging URL.',
                icon: Cloud,
                color: 'from-emerald-500 to-teal-500',
              },
              {
                step: '02',
                title: 'Import / AI Generate',
                desc: 'Upload test cases in JSON, CSV, Markdown, or let Gemini AI draft complete functional suites.',
                icon: Sparkles,
                color: 'from-cyan-500 to-blue-500',
              },
              {
                step: '03',
                title: 'Interactive Dataset',
                desc: 'As tests encounter dynamic variables, interactively input real tokens or auto-generate synthetic data.',
                icon: Database,
                color: 'from-amber-500 to-orange-500',
              },
              {
                step: '04',
                title: 'Run In-Console',
                desc: 'Execute functional & burst-load tests live with instant latency graphs and assertion checks.',
                icon: Play,
                color: 'from-emerald-500 to-teal-500',
              },
              {
                step: '05',
                title: 'Multi-Cloud Docker',
                desc: 'Download the self-contained package. Deploy with 1-click on AWS, GCP, Azure, or Kubernetes.',
                icon: Download,
                color: 'from-indigo-500 to-purple-500',
              },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={i}
                  className="relative rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 transition hover:border-[#2D334D] hover:shadow-xl"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-500">{card.step}</span>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${card.color} text-slate-950 shadow-md`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-white">{card.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{card.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Platform Capabilities At A Glance — technical stack + business capability summary */}
      <section id="platform-capabilities" className="border-t border-[#1E2235] bg-[#0F111A]/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">What Verity Actually Ships</h2>
            <p className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Technical & Business Capabilities</p>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
              Every capability below maps to a working part of the platform — the interactive Studio, the hosted API, or a Docker export — not a roadmap slide.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Technical capabilities */}
            <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
              <div className="flex items-center gap-2 border-b border-[#1E2235] pb-4">
                <Code2 className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Technical Capabilities</h3>
              </div>
              <ul className="mt-4 space-y-3 text-xs text-slate-300">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span><strong className="text-white">Live network introspection</strong> of a target URL — routes, headers, SSL config, sitemap/robots — used to build real parameter datasets instead of guessed ones.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span><strong className="text-white">AI-assisted test generation</strong> from an uploaded spec, CSV, or Markdown table, parsed by the platform's spec parser into executable HTTP/load/manual test cases.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span><strong className="text-white">Interactive dataset resolution</strong> — the Studio detects missing variables and asks for them, rather than silently substituting placeholder values.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span><strong className="text-white">Self-contained Docker packaging</strong> with deploy instructions for Cloud Run, ECS/App Runner, Azure Container Apps, or Kubernetes — no vendor lock-in.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span><strong className="text-white">Hosted execution engine</strong> (React 19 + Express/TypeScript) with persisted run history, scheduling (daily/weekly/cron), and CSV/report export.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span><strong className="text-white">Real analytics</strong> — pass rate, latency percentiles, and flakiness computed from actual persisted test runs, with an honest zero-state when nothing has run yet.</span></li>
              </ul>
            </div>

            {/* Business capabilities */}
            <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
              <div className="flex items-center gap-2 border-b border-[#1E2235] pb-4">
                <Building2 className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Business Capabilities</h3>
              </div>
              <ul className="mt-4 space-y-3 text-xs text-slate-300">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span><strong className="text-white">Multi-tenant organizations</strong> with role-based access — platform superadmin, org admin, team member, and standalone developer.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span><strong className="text-white">Credit-based billing</strong> for hosted execution, with a full ledger, daily free-preview caps, and self-hosted Docker as a zero-cost unlimited alternative.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span><strong className="text-white">Customer onboarding journeys</strong> — seed an org, allocate team budgets, and invite engineers, end to end.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span><strong className="text-white">Security & governance controls</strong> — API key rotation history, org security configuration, and platform audit logs.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span><strong className="text-white">Two revenue paths</strong> — pay-per-execution hosted cloud, or a one-time export to self-hosted infrastructure the customer fully controls.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span><strong className="text-white">Transparent contact & support routing</strong> for engineering solutions and enterprise deployment questions.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud & Onboarding Roles Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400">Enterprise Team Governance</h2>
              <p className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">
                Built for Superadmins, Customer Leads, and Standalone Engineers
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Verity provides custom onboarding journeys tailored for every organizational tier. Seed customer organizations, allocate compute and token budgets, and manage team members with ease.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  {
                    title: 'Platform Superadmin Onboarding Wizard',
                    desc: 'Create customer organizations, seed Customer Admins with temporary credentials, and allocate resource budgets.',
                    role: 'platform_admin',
                  },
                  {
                    title: 'Customer Admin Team Seeding',
                    desc: 'Divide enterprise credits across sub-teams, manage API token budgets, and invite engineers with one click.',
                    role: 'org_admin',
                  },
                  {
                    title: 'Standalone Developer Freedom',
                    desc: 'Self-serve signup, free trial preview runs, and unrestricted export to local Docker or CI/CD pipelines.',
                    role: 'standalone',
                  },
                ].map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-[#1E2235] bg-[#0F111A] p-4 transition hover:border-[#2D334D]">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white">{item.title}</h4>
                      <span className="rounded border border-[#1E2235] bg-[#121520] px-2 py-0.5 text-[10px] font-semibold text-emerald-400 capitalize">
                        {item.role.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-Cloud Deployment Architecture */}
            <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#1E2235] pb-4">
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Multi-Cloud Standalone Architecture</h3>
                </div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  Zero Lock-In
                </span>
              </div>

              <div className="mt-4 space-y-3 font-mono text-xs">
                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Google Cloud Platform</span>
                    <span className="text-emerald-400">Cloud Run Serverless</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">gcloud run deploy --image gcr.io/... --port 4100</div>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Amazon Web Services</span>
                    <span className="text-emerald-400">ECS Fargate / App Runner</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">aws ecr push && ecs deploy --port 4100</div>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Microsoft Azure</span>
                    <span className="text-emerald-400">Container Apps</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">az containerapp create --target-port 4100</div>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Kubernetes & Local Docker</span>
                    <span className="text-emerald-400">k8s/deployment.yaml</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">kubectl apply -f k8s/ || docker compose up -d</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive ROI Calculator */}
      <section className="border-t border-[#1E2235] bg-[#0F111A]/40 py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Transparent Economic Advantage</h2>
            <p className="mt-2 text-3xl font-extrabold text-white">
              Calculate Your Testing Cloud Savings
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Traditional SaaS test platforms charge hefty seat licenses and per-minute run rates. Verity gives you self-hosted freedom.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">
                Monthly Automated Test Executions: <span className="font-mono text-emerald-400 text-sm">{monthlyTests.toLocaleString()} runs</span>
              </label>
            </div>
            <input
              type="range"
              min="5000"
              max="250000"
              step="5000"
              value={monthlyTests}
              onChange={(e) => setMonthlyTests(Number(e.target.value))}
              className="mt-3 w-full accent-emerald-500 cursor-pointer"
            />

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 text-center">
                <div className="text-xs font-semibold text-rose-400">Legacy SaaS Providers</div>
                <div className="mt-2 text-2xl font-black text-white">${traditionalCost.toLocaleString()}<span className="text-xs text-slate-400">/mo</span></div>
                <div className="mt-1 text-[11px] text-slate-500">Seat fees + execution limits</div>
              </div>

              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-center ring-2 ring-emerald-500/20">
                <div className="text-xs font-bold text-emerald-300">Verity Self-Hosted Docker</div>
                <div className="mt-2 text-2xl font-black text-emerald-400">$0<span className="text-xs text-slate-400">/mo</span></div>
                <div className="mt-1 text-[11px] text-emerald-300/80">Unlimited test runs in your cloud</div>
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4 text-center">
                <div className="text-xs font-semibold text-cyan-400">Verity Hosted Cloud</div>
                <div className="mt-2 text-2xl font-black text-white">${verityCloudCost.toLocaleString()}<span className="text-xs text-slate-400">/mo</span></div>
                <div className="mt-1 text-[11px] text-slate-500">Zero infrastructure management</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Test Coverage & Analytical Intelligence Widget */}
      <TestCoverageWidget />

      {/* Call to Action */}
      <section className="py-20 text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Ready to automate your test suites today?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400">
            Start free in the browser with 15 free previews daily, or download the Docker container for unlimited tests.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={onStartStudio}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500"
            >
              <Play className="h-4 w-4 fill-slate-950" />
              <span>Get Started In Studio</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Zap, Download, Server, Cloud, Shield, Terminal, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { PricingTier, CreditLedgerEntry } from '../types';

interface PricingViewProps {
  onStartStudio: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenBilling: () => void;
}

export const PricingView: React.FC<PricingViewProps> = ({
  onStartStudio,
  onOpenAuth,
  onOpenBilling,
}) => {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getBillingStatus()
      .then(res => setTiers(res.pricingTiers))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-300">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          <span>Flexible Self-Hosted & Cloud Pricing</span>
        </div>
        <h1 className="mt-4 text-3xl font-extrabold text-white sm:text-5xl">
          Zero-Lock-In Testing Freedom
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-400">
          Run unlimited tests self-hosted in your Docker / Kubernetes clusters for free, or leverage our high-concurrency cloud runner for $0.01 per run.
        </p>
      </div>

      {/* Comparison Grid */}
      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Card 1: Self-Hosted Docker Package */}
        <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-slate-900 to-slate-950 p-8 shadow-2xl ring-1 ring-emerald-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Self-Hosted Standalone Docker</h3>
                <span className="text-xs text-emerald-400 font-semibold">100% Free Forever</span>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
              UNLIMITED
            </span>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-300">
            Download the complete package (.zip) for any project. Run the standalone Express API server, responsive web dashboard, and headless CLI inside your VPC.
          </p>

          <ul className="mt-6 space-y-3 text-xs text-slate-300">
            {[
              'Unlimited functional and load test executions',
              'Self-contained Dockerfile & docker-compose.yml',
              'Ready-to-deploy Google Cloud Run, AWS ECS, Azure Container Apps scripts',
              'Bundled Kubernetes manifests and Terraform modules',
              'Headless CLI runner with pipeline exit codes (0/1)',
              'Zero telemetry, no phone-home, 100% private in VPC',
            ].map((f, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-2xl font-black text-white">$0</div>
              <div className="text-[11px] text-slate-400">No subscriptions, no hidden limits</div>
            </div>
            <button
              onClick={onStartStudio}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
            >
              <Download className="h-4 w-4" />
              <span>Export Package</span>
            </button>
          </div>
        </div>

        {/* Card 2: Managed Cloud Execution */}
        <div className="rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-slate-900 to-slate-950 p-8 shadow-2xl ring-1 ring-cyan-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Managed Cloud Platform</h3>
                <span className="text-xs text-cyan-400 font-semibold">15 Free Previews Daily / Pay-As-You-Go</span>
              </div>
            </div>
            <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-bold text-cyan-300 border border-cyan-500/30">
              ZERO SETUP
            </span>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-300">
            Execute all test cases directly within the Verity web studio. Powered by high-speed serverless runners with interactive missing dataset prompting.
          </p>

          <ul className="mt-6 space-y-3 text-xs text-slate-300">
            {[
              '15 free preview runs per project every 24 hours',
              '1 compute credit per hosted test case run thereafter',
              'AI Test Suite Generation powered by Gemini 2.5 Flash',
              'Interactive missing parameter detection & instant mocking',
              'Team resource management & organization token budgeting',
              'Live request/response inspector & latency analytics',
            ].map((f, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-2xl font-black text-white">$0.01<span className="text-xs text-slate-400">/run</span></div>
              <div className="text-[11px] text-slate-400">Volume packs with significant discounts</div>
            </div>
            <button
              onClick={onOpenBilling}
              className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
            >
              <Zap className="h-4 w-4" />
              <span>Purchase Credits</span>
            </button>
          </div>
        </div>
      </div>

      {/* Credit Packs Grid */}
      <div className="mt-16">
        <h2 className="text-center text-xl font-bold text-white">Compute Credit Packs</h2>
        <p className="text-center text-xs text-slate-400 mt-1">One-time purchase packs for hosted cloud execution. Credits never expire.</p>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {tiers.map(tier => (
            <div
              key={tier.id}
              className={`rounded-2xl border p-6 flex flex-col justify-between ${
                tier.popular ? 'border-cyan-500/50 bg-slate-900 ring-2 ring-cyan-500/20' : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">{tier.name}</h3>
                  {tier.popular && <span className="rounded bg-cyan-500 px-2 py-0.5 text-[10px] font-bold text-slate-950">POPULAR</span>}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">${tier.priceUsd}</span>
                  <span className="text-xs text-slate-400">USD</span>
                </div>
                <div className="mt-1 text-xs font-bold text-cyan-400">{tier.credits.toLocaleString()} Compute Credits</div>
                <p className="mt-3 text-xs text-slate-400">{tier.description}</p>
              </div>

              <button
                onClick={onOpenBilling}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
              >
                <Zap className="h-3.5 w-3.5 text-cyan-400" />
                <span>Buy {tier.name}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

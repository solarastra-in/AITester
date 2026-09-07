import React, { useState, useEffect } from 'react';
import { CreditCard, Zap, CheckCircle2, ArrowRight, ShieldCheck, X, Sparkles, Clock, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { PricingTier, CreditLedgerEntry } from '../types';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBalanceUpdated?: () => void;
}

export const BillingModal: React.FC<BillingModalProps> = ({ isOpen, onClose, onBalanceUpdated }) => {
  const [data, setData] = useState<{
    accountType: string;
    name: string;
    creditsBalance: number;
    pricingTiers: PricingTier[];
    ledger: CreditLedgerEntry[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [purchasingTierId, setPurchasingTierId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await api.getBillingStatus();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  const handleTopUp = async (tierId: string) => {
    try {
      setPurchasingTierId(tierId);
      setErrorMessage(null);
      const res = await api.topUpCredits(tierId);
      setSuccessMessage(res.message);
      loadStatus();
      if (onBalanceUpdated) onBalanceUpdated();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment simulation failed.');
    } finally {
      setPurchasingTierId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-[#1E2235] bg-[#0F111A] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E2235] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Credits, Compute & Billing</h3>
              <p className="text-xs text-slate-400">
                Self-hosted standalone execution is free. Hosted cloud executions cost 1 credit/run.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#131622] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Current Balance Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5">
            <div>
              <span className="text-xs font-semibold text-slate-400">Current Available Credit Balance:</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">{data?.creditsBalance ?? 0}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Compute Credits</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-semibold text-slate-400">Account Type</div>
              <div className="text-xs font-bold text-white uppercase">{data?.accountType} ({data?.name})</div>
            </div>
          </div>

          {/* Pricing Tiers Grid */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Instant Credit Top-Up Packs</h4>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {data?.pricingTiers?.map(tier => (
                <div
                  key={tier.id}
                  data-testid={`pricing-tier-${tier.id}`}
                  className={`relative flex flex-col justify-between rounded-2xl border p-5 ${
                    tier.popular
                      ? 'border-emerald-500/50 bg-[#131622] ring-2 ring-emerald-500/20'
                      : 'border-[#1E2235] bg-[#0F111A]'
                  }`}
                >
                  {tier.popular && (
                    <span className="absolute -top-2.5 right-4 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                      Most Popular
                    </span>
                  )}

                  <div>
                    <div className="text-sm font-bold text-white">{tier.name}</div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white">${tier.priceUsd}</span>
                      <span className="text-xs text-slate-400">USD</span>
                    </div>
                    <div className="mt-1 text-xs font-bold text-emerald-400">{tier.credits.toLocaleString()} Credits</div>
                    <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">{tier.description}</p>

                    <ul className="mt-4 space-y-1.5 text-[11px] text-slate-300">
                      {tier.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleTopUp(tier.id)}
                    disabled={purchasingTierId !== null}
                    className={`mt-6 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
                      tier.popular
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : 'border border-[#1E2235] bg-[#131622] text-slate-200 hover:bg-[#1A1D2B]'
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>{purchasingTierId === tier.id ? 'Processing...' : 'Load Credits'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Ledger History */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Credit Ledger & Transaction Audit</h4>
            <div className="mt-3 overflow-hidden rounded-2xl border border-[#1E2235] bg-[#06070B]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#1E2235] bg-[#0F111A] font-semibold text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Description / Reason</th>
                    <th className="px-4 py-2.5">Delta</th>
                    <th className="px-4 py-2.5">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2235] font-mono text-slate-300">
                  {data?.ledger?.slice(0, 10).map(entry => (
                    <tr key={entry.id} className="hover:bg-[#0F111A] text-[11px]">
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-sans">{entry.reason}</td>
                      <td className={`px-4 py-2 font-bold ${entry.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                      </td>
                      <td className="px-4 py-2 text-slate-300">{entry.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  Users,
  Layers,
  Zap,
  Plus,
  Key,
  Copy,
  CheckCircle2,
  Activity,
  DollarSign,
  TrendingUp,
  AlertCircle,
  FileText
} from 'lucide-react';
import { api } from '../services/api';
import { SystemAuditLog } from '../types';
import { AlertModal } from './AlertModal';

export const SuperAdminView: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Active tab
  const [activeTab, setActiveTab] = useState<'onboard' | 'orgs' | 'users' | 'audit'>('onboard');

  // Customer Org Onboarding Form State
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [plan, setPlan] = useState('pro');
  const [initialCredits, setInitialCredits] = useState(2500);
  const [tokenBudget, setTokenBudget] = useState(1000000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Result credential banner
  const [onboardedResult, setOnboardedResult] = useState<{
    orgName: string;
    adminName: string;
    adminEmail: string;
    tempPass: string;
    credits: number;
  } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Credit adjustment modal
  const [adjustModalOrg, setAdjustModalOrg] = useState<any | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(500);
  const [adjustReason, setAdjustReason] = useState('Quarterly SLA Enterprise Grant');
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string } | null>(null);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [s, o, u, a] = await Promise.all([
        api.getAdminStats(),
        api.getAdminOrgs(),
        api.getAdminUsers(),
        api.getAdminAuditLogs(),
      ]);
      setStats(s);
      setOrgs(o);
      setUsers(u);
      setAuditLogs(a);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !adminName.trim() || !adminEmail.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await api.onboardCustomerOrg({
        orgName: orgName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        plan,
        initialCredits,
        tokenBudget,
      });

      setOnboardedResult({
        orgName: res.organization.name,
        adminName: res.orgAdmin.name,
        adminEmail: res.orgAdmin.email,
        tempPass: res.tempPassword,
        credits: res.organization.creditsBalance,
      });

      setOrgName('');
      setAdminName('');
      setAdminEmail('');
      loadAll();
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message || 'Onboarding failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalOrg) return;
    try {
      await api.grantOrgCredits(adjustModalOrg.id, adjustAmount, adjustReason);
      setAdjustModalOrg(null);
      loadAll();
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message || 'Credit adjustment failed.' });
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2235] pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/20 text-slate-950 font-bold">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-white">Platform Superadmin Console</h1>
              <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-300 uppercase border border-rose-500/30">
                Root Governance
              </span>
            </div>
            <p className="text-xs text-slate-400">Manage global organizations, seed Customer Admins, and allocate compute budgets.</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl border border-[#1E2235] bg-[#0F111A] p-1">
          {[
            { id: 'onboard', label: 'Onboard Customer Org' },
            { id: 'orgs', label: 'Organizations' },
            { id: 'users', label: 'All Users' },
            { id: 'audit', label: 'Audit Trail' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Global Statistics */}
      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
            <div className="text-xs text-slate-400">Total Customer Orgs</div>
            <div className="mt-1 text-2xl font-black text-white">{stats.orgCount}</div>
          </div>
          <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
            <div className="text-xs text-slate-400">Total System Users</div>
            <div className="mt-1 text-2xl font-black text-white">{stats.userCount}</div>
          </div>
          <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
            <div className="text-xs text-slate-400">Active Test Projects</div>
            <div className="mt-1 text-2xl font-black text-white">{stats.projectCount}</div>
          </div>
          <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
            <div className="text-xs text-slate-400">Automated Runs</div>
            <div className="mt-1 text-2xl font-black text-emerald-300">{stats.totalRuns}</div>
          </div>
          <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
            <div className="text-xs text-slate-400">Credits Consumed</div>
            <div className="mt-1 text-2xl font-black text-amber-400">{stats.creditsSpent}</div>
          </div>
        </div>
      )}

      {/* TAB 1: Onboard Customer Organization Journey */}
      {activeTab === 'onboard' && (
        <div className="mt-8">
          {/* Onboarding Result Banner */}
          {onboardedResult && (
            <div className="mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-6 shadow-2xl backdrop-blur-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Customer Admin Provisioned!</h3>
                    <p className="text-xs text-slate-300">
                      Organization <span className="font-semibold text-emerald-300">{onboardedResult.orgName}</span> is live with {onboardedResult.credits} credits.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOnboardedResult(null)}
                  className="text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs">
                <div>
                  <span className="text-slate-500">Customer Admin:</span> <span className="text-white">{onboardedResult.adminName}</span>
                </div>
                <div>
                  <span className="text-slate-500">Email:</span> <span className="text-white">{onboardedResult.adminEmail}</span>
                </div>
                <div>
                  <span className="text-slate-500">Temporary Password:</span>{' '}
                  <span className="rounded bg-[#131622] px-2 py-0.5 text-emerald-300 font-bold border border-[#1E2235]">{onboardedResult.tempPass}</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Customer Admin Credentials for ${onboardedResult.orgName}:\nLogin: ${onboardedResult.adminEmail}\nTemp Password: ${onboardedResult.tempPass}`);
                    setCopiedPass(true);
                    setTimeout(() => setCopiedPass(false), 2000);
                  }}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:underline ml-auto"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedPass ? 'Copied to Clipboard!' : 'Copy Admin Credentials'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Form */}
            <div className="lg:col-span-7 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-rose-400" />
                <h2 className="text-base font-bold text-white">Customer Organization Onboarding Wizard</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Instantly provisions a new tenant, seeds their Customer Admin, and allocates resource compute credits.
              </p>

              <form onSubmit={handleOnboardSubmit} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Customer Organization Name</label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g. Apex Health Systems"
                      required
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">SLA Subscription Plan</label>
                    <select
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                    >
                      <option value="trial">Trial Tier</option>
                      <option value="pro">Pro Business Tier</option>
                      <option value="enterprise">Enterprise Tier</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-[#1E2235] pt-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Seed Customer Admin Name</label>
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="e.g. Rachel Lead"
                      required
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">Customer Admin Email</label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="rachel@apexhealth.com"
                      required
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-[#1E2235] pt-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Initial Credits Allocation</label>
                    <input
                      type="number"
                      value={initialCredits}
                      onChange={(e) => setInitialCredits(Number(e.target.value))}
                      min={0}
                      step={500}
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">AI Token Budget</label>
                    <input
                      type="number"
                      value={tokenBudget}
                      onChange={(e) => setTokenBudget(Number(e.target.value))}
                      min={100000}
                      step={250000}
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-500/20 transition hover:from-rose-400 hover:to-red-500 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{isSubmitting ? 'Provisioning...' : 'Provision Customer Org & Seed Admin'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Explanatory cards */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5">
                <div className="text-xs font-bold text-white">Automated Customer Journey Flow</div>
                <ul className="mt-3 space-y-2 text-xs text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold">1.</span>
                    <span>Creates isolated tenant organization in Verity system.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold">2.</span>
                    <span>Seeds customer administrator with role <code className="text-emerald-400">org_admin</code>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold">3.</span>
                    <span>Generates temporary password requiring reset upon first login.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold">4.</span>
                    <span>Injects initial credits directly to the organization ledger.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Organizations List */}
      {activeTab === 'orgs' && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-[#1E2235] bg-[#0F111A]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1E2235] bg-[#06070B]/60 font-semibold text-slate-400">
                <tr>
                  <th className="px-6 py-3">Organization</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Customer Admin</th>
                  <th className="px-6 py-3">Credit Balance</th>
                  <th className="px-6 py-3">Members</th>
                  <th className="px-6 py-3">Projects</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2235] text-slate-300">
                {orgs.map(org => (
                  <tr key={org.id} className="hover:bg-[#131622]/40">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-white">{org.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{org.id}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="rounded bg-[#1A1D2B] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300 border border-[#1E2235]">
                        {org.plan}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {org.adminUser ? (
                        <div>
                          <div className="text-white">{org.adminUser.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{org.adminUser.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">None</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 font-mono font-bold text-emerald-300">
                      {org.creditsBalance}
                    </td>
                    <td className="px-6 py-3.5">{org.memberCount}</td>
                    <td className="px-6 py-3.5">{org.projectCount}</td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => setAdjustModalOrg(org)}
                        className="rounded-lg border border-[#1E2235] bg-[#131622] px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-[#1A1D2B]"
                      >
                        Adjust Credits
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Users List */}
      {activeTab === 'users' && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-[#1E2235] bg-[#0F111A]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1E2235] bg-[#06070B]/60 font-semibold text-slate-400">
                <tr>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Organization</th>
                  <th className="px-6 py-3">Personal Credits</th>
                  <th className="px-6 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2235] text-slate-300">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[#131622]/40">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-white">{u.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        u.role === 'platform_admin' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        u.role === 'org_admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        u.role === 'member' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-400">
                      {u.orgName || 'Standalone Developer'}
                    </td>
                    <td className="px-6 py-3.5 font-mono">{u.creditsBalance}</td>
                    <td className="px-6 py-3.5 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-[#1E2235] bg-[#0F111A]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1E2235] bg-[#06070B]/60 font-semibold text-slate-400">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2235] text-slate-300 font-mono">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-[#131622]/40 text-[11px]">
                    <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className="rounded bg-[#131622] px-2 py-0.5 font-bold text-emerald-400 border border-[#1E2235]">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-white">{log.userEmail}</td>
                    <td className="px-6 py-3 text-slate-300 font-sans text-xs">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Credit Adjustment Modal */}
      {adjustModalOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Adjust Credits for {adjustModalOrg.name}</h3>
            <form onSubmit={handleAdjustCredits} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Credit Delta Amount (+ or -)</label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Adjustment Reason</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalOrg(null)}
                  className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-400"
                >
                  Apply Credit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Alert Modal */}
      {alertModal && (
        <AlertModal
          isOpen={alertModal.isOpen}
          message={alertModal.message}
          onClose={() => setAlertModal(null)}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  Layers,
  Zap,
  Plus,
  Key,
  Shield,
  CheckCircle2,
  Copy,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Sparkles,
  Lock
} from 'lucide-react';
import { api } from '../services/api';
import { User, Organization, Team, Project, CreditLedgerEntry, OrgSecurityConfig, SystemAuditLog } from '../types';
import { AlertModal } from './AlertModal';
import { OrgAdminSecurityTab } from './OrgAdminSecurityTab';

interface OrgAdminViewProps {
  currentUser: User;
  onOpenBilling: () => void;
}

export const OrgAdminView: React.FC<OrgAdminViewProps> = ({ currentUser, onOpenBilling }) => {
  const [data, setData] = useState<{
    organization: Organization;
    members: User[];
    teams: Team[];
    projects: Project[];
    ledger: CreditLedgerEntry[];
    securityConfig?: OrgSecurityConfig;
  } | null>(null);

  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'teams' | 'members' | 'security'>('teams');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamTokens, setNewTeamTokens] = useState(250000);
  const [newTeamCredits, setNewTeamCredits] = useState(100);

  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'member' | 'org_admin'>('member');
  const [newMemberTeamId, setNewMemberTeamId] = useState('');

  // Generated credential banner
  const [seededCredential, setSeededCredential] = useState<{ name: string; email: string; tempPass: string } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getOrgOverview();
      setData(res);

      try {
        const secRes = await api.getOrgSecurity();
        if (secRes.auditLogs) {
          setAuditLogs(secRes.auditLogs);
        }
      } catch (secErr) {
        // Fallback gracefully if security logs query is pending
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organization overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      await api.seedOrgTeam(newTeamName.trim(), newTeamTokens, newTeamCredits);
      setIsTeamModalOpen(false);
      setNewTeamName('');
      loadData();
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message || 'Failed to create team.' });
    }
  };

  const handleSeedMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim() || !newMemberName.trim()) return;
    try {
      const res = await api.seedOrgMember(newMemberName.trim(), newMemberEmail.trim(), newMemberRole, newMemberTeamId || undefined);
      setIsMemberModalOpen(false);
      setSeededCredential({
        name: newMemberName.trim(),
        email: newMemberEmail.trim(),
        tempPass: res.tempPassword,
      });
      setNewMemberName('');
      setNewMemberEmail('');
      loadData();
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message || 'Failed to seed member.' });
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-emerald-400 font-semibold">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <span>Loading Customer Admin Portal...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
          <h3 className="mt-3 text-base font-bold text-white">Customer Admin Access Required</h3>
          <p className="mt-1 text-xs text-slate-400">{error || 'Unable to find organization profile.'}</p>
        </div>
      </div>
    );
  }

  const { organization, members, teams, projects, ledger } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Seeded Credential Delivery Banner */}
      {seededCredential && (
        <div className="mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-5 shadow-2xl backdrop-blur-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Team Member Seeded Successfully!</h4>
                <p className="text-xs text-slate-300">
                  Provide these initial credentials to <span className="font-semibold text-emerald-300">{seededCredential.name}</span>. They will be prompted to reset on first login.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSeededCredential(null)}
              className="text-xs font-semibold text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-[#1E2235] bg-[#06070B] p-3 font-mono text-xs">
            <div>
              <span className="text-slate-500">Email:</span> <span className="text-white">{seededCredential.email}</span>
            </div>
            <div>
              <span className="text-slate-500">Temporary Password:</span>{' '}
              <span className="rounded bg-[#131622] px-2 py-0.5 text-emerald-300 font-bold border border-[#1E2235]">{seededCredential.tempPass}</span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`Email: ${seededCredential.email}\nTemp Password: ${seededCredential.tempPass}`);
                setCopiedPass(true);
                setTimeout(() => setCopiedPass(false), 2000);
              }}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:underline ml-auto"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copiedPass ? 'Copied to Clipboard!' : 'Copy Credentials'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Overview */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2235] pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 text-slate-950 font-bold">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-white">{organization.name}</h1>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300 uppercase border border-emerald-500/30">
                {organization.plan} Plan
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">Org ID: {organization.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTeamModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#1A1D2B]"
          >
            <Plus className="h-4 w-4 text-emerald-400" />
            <span>Seed New Team</span>
          </button>

          <button
            onClick={() => setIsMemberModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500"
          >
            <Users className="h-4 w-4" />
            <span>Seed Team Member</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Available Balance</span>
            <Zap className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">{organization.creditsBalance}</div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Runs compute budget</span>
            <button onClick={onOpenBilling} className="text-emerald-400 hover:underline">Top Up</button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Active Teams</span>
            <Layers className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">{teams.length}</div>
          <div className="mt-1 text-[11px] text-slate-500">Resource isolated groups</div>
        </div>

        <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Team Members</span>
            <Users className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">{members.length}</div>
          <div className="mt-1 text-[11px] text-slate-500">Active engineers & leads</div>
        </div>

        <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Testing Projects</span>
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">{projects.length}</div>
          <div className="mt-1 text-[11px] text-slate-500">Active target test suites</div>
        </div>
      </div>

      {/* Top Navigation Tabs */}
      <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-[#1E2235] pb-3">
        <button
          onClick={() => setActiveTab('teams')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === 'teams'
              ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-emerald-500/30 border border-[#1E2235]'
              : 'text-slate-400 hover:bg-[#131622] hover:text-white'
          }`}
        >
          <Layers className={`h-4 w-4 ${activeTab === 'teams' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Teams & Budgets ({teams.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === 'members'
              ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-emerald-500/30 border border-[#1E2235]'
              : 'text-slate-400 hover:bg-[#131622] hover:text-white'
          }`}
        >
          <Users className={`h-4 w-4 ${activeTab === 'members' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Team Members ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === 'security'
              ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-emerald-500/30 border border-[#1E2235]'
              : 'text-slate-400 hover:bg-[#131622] hover:text-white'
          }`}
        >
          <Shield className={`h-4 w-4 ${activeTab === 'security' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Security & API Keys</span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
            {data.securityConfig?.apiKeys?.length || 3} Active
          </span>
        </button>
      </div>

      {/* Tab: Teams Grid */}
      {activeTab === 'teams' && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Allocated Teams & Budgets</h2>
              <p className="text-xs text-slate-400">Resource quotas for engineering & QA squads.</p>
            </div>
            <button
              onClick={() => setIsTeamModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-[#1A1D2B]"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              <span>Add Team</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {teams.map(t => {
              const teamMembers = members.filter(m => m.teamId === t.id);
              return (
                <div key={t.id} className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{t.name}</h3>
                    <span className="font-mono text-[10px] text-slate-500">{t.id}</span>
                  </div>
                  <div className="mt-4 space-y-2 font-mono text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>AI Token Quota:</span>
                      <span className="text-emerald-300">{t.budgetTokens.toLocaleString()} tokens</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Assigned Members:</span>
                      <span className="text-white">{teamMembers.length} users</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Members Table */}
      {activeTab === 'members' && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Team Members & Access Roles</h2>
              <p className="text-xs text-slate-400">Manage developer and QA access permissions within your organization.</p>
            </div>
            <button
              onClick={() => setIsMemberModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition hover:from-emerald-400 hover:to-teal-500"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Invite Member</span>
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[#1E2235] bg-[#0F111A]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1E2235] bg-[#06070B]/60 font-semibold text-slate-400">
                <tr>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Team</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2235] text-slate-300">
                {members.map(m => (
                  <tr key={m.id} className="hover:bg-[#131622]/40">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-white">{m.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{m.email}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        m.role === 'org_admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-[#1A1D2B] text-slate-300 border border-[#1E2235]'
                      }`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-400">
                      {teams.find(t => t.id === m.teamId)?.name || 'General Org'}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Active</span>
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-400">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Security & API Keys */}
      {activeTab === 'security' && data.securityConfig && (
        <div className="mt-8">
          <OrgAdminSecurityTab
            securityConfig={data.securityConfig}
            auditLogs={auditLogs}
            onRefresh={loadData}
          />
        </div>
      )}

      {/* Modal: Seed Team */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Seed New Team & Resource Budget</h3>
            <p className="mt-1 text-xs text-slate-400">Allocate resource limits for a dedicated squad.</p>
            <form onSubmit={handleCreateTeam} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Team Name</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Core API Squad"
                  required
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">AI Generation Token Budget</label>
                <input
                  type="number"
                  value={newTeamTokens}
                  onChange={(e) => setNewTeamTokens(Number(e.target.value))}
                  min={10000}
                  step={50000}
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Seed Member */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Seed Team Member Account</h3>
            <p className="mt-1 text-xs text-slate-400">Creates user and generates a temporary login password.</p>
            <form onSubmit={handleSeedMember} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Full Name</label>
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Jordan QA"
                  required
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Email Address</label>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="jordan@acmecorp.com"
                  required
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Role</label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="member">Engineer / QA</option>
                    <option value="org_admin">Customer Admin</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Assign Team</label>
                  <select
                    value={newMemberTeamId}
                    onChange={(e) => setNewMemberTeamId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">General (No Team)</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Seed Member
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

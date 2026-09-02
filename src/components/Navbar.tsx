import React, { useState } from 'react';
import {
  Layers,
  Play,
  Building2,
  ShieldCheck,
  CreditCard,
  User as UserIcon,
  ChevronDown,
  LogOut,
  Sparkles,
  Zap,
  CheckCircle2,
  ExternalLink,
  Code2
} from 'lucide-react';
import { User, Organization } from '../types';

interface NavbarProps {
  currentView: 'home' | 'studio' | 'org_admin' | 'super_admin' | 'pricing';
  onNavigate: (view: 'home' | 'studio' | 'org_admin' | 'super_admin' | 'pricing') => void;
  currentUser: User | null;
  currentOrg: Organization | null;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenBilling: () => void;
  onSwitchPersona: (role?: string, email?: string) => void;
  onLogout: () => void;
}

const DEMO_PERSONAS = [
  { role: 'platform_admin', label: 'Platform Superadmin', email: 'admin@verity.dev', badge: 'Superadmin', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  { role: 'org_admin', label: 'Customer Admin (Sarah)', email: 'qa.lead@acmecorp.com', badge: 'Org Admin', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { role: 'member', label: 'Team Member (Alex)', email: 'alex.engineer@acmecorp.com', badge: 'Engineer', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { role: 'standalone', label: 'Standalone Developer', email: 'developer@indie.io', badge: 'Standalone', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  currentOrg,
  onOpenAuth,
  onOpenBilling,
  onSwitchPersona,
  onLogout,
}) => {
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isPlatformAdmin = currentUser?.role === 'platform_admin';
  const isOrgAdmin = currentUser?.role === 'org_admin' || isPlatformAdmin;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#1E2235] bg-[#0A0B10]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 text-left transition hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/40">
              <span className="font-mono text-lg font-black text-slate-950">◈</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">VERITY</span>
                <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-800/50">
                  v1.0
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-400">Automated Test Platform</span>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-1 md:flex">
            <button
              onClick={() => onNavigate('home')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                currentView === 'home'
                  ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-[#2D334D]'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => onNavigate('studio')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                currentView === 'studio'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              Interactive Studio
            </button>

            {isOrgAdmin && (
              <button
                onClick={() => onNavigate('org_admin')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  currentView === 'org_admin'
                    ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                    : 'text-slate-300 hover:bg-[#131622] hover:text-white'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-amber-400" />
                Customer Admin
              </button>
            )}

            {isPlatformAdmin && (
              <button
                onClick={() => onNavigate('super_admin')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  currentView === 'super_admin'
                    ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                    : 'text-slate-300 hover:bg-[#131622] hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-rose-400" />
                Platform Superadmin
              </button>
            )}

            <button
              onClick={() => onNavigate('pricing')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                currentView === 'pricing'
                  ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-[#2D334D]'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              Pricing & Deploy
            </button>
          </nav>
        </div>

        {/* Right Section: Persona Switcher, Balance, Profile */}
        <div className="flex items-center gap-3">
          {/* Quick Persona Switcher for Live Demo & Review */}
          <div className="relative">
            <button
              onClick={() => setPersonaMenuOpen(!personaMenuOpen)}
              className="flex items-center gap-2 rounded-lg border border-[#1E2235] bg-[#0F111A] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-[#2D334D] hover:bg-[#131622]"
              title="Switch demo persona to test different journeys"
            >
              <div className="flex h-2 w-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20" />
              <span className="hidden text-slate-400 sm:inline">Role:</span>
              <span className="font-semibold text-white">
                {currentUser?.role === 'platform_admin'
                  ? 'Platform Admin'
                  : currentUser?.role === 'org_admin'
                  ? 'Customer Admin'
                  : currentUser?.role === 'member'
                  ? 'Team Member'
                  : currentUser
                  ? 'Standalone'
                  : 'Guest'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {personaMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl border border-[#1E2235] bg-[#0F111A] p-2 shadow-2xl ring-1 ring-black/50">
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Switch Journey Persona
                </div>
                <div className="space-y-1">
                  {DEMO_PERSONAS.map(p => (
                    <button
                      key={p.role}
                      onClick={() => {
                        onSwitchPersona(p.role, p.email);
                        setPersonaMenuOpen(false);
                      }}
                      className={`flex w-full items-start justify-between rounded-lg p-2 text-left transition hover:bg-[#131622] ${
                        currentUser?.email === p.email ? 'bg-[#1A1D2B] ring-1 ring-emerald-500/40' : ''
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-white">{p.label}</div>
                        <div className="font-mono text-[10px] text-slate-400">{p.email}</div>
                      </div>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${p.color}`}>
                        {p.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Credits Balance Pill */}
          {currentUser && (
            <button
              onClick={onOpenBilling}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-900/40"
              title="Click to view ledger or top up credits"
            >
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-semibold">{currentOrg ? currentOrg.creditsBalance : currentUser.creditsBalance}</span>
              <span className="text-[10px] text-emerald-400/80">credits</span>
            </button>
          )}

          {/* User Profile / Auth Actions */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1D2B] text-xs font-bold text-slate-200 ring-1 ring-[#2D334D] transition hover:ring-emerald-500"
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-[#1E2235] bg-[#0F111A] p-2 shadow-2xl">
                  <div className="border-b border-[#1E2235] px-3 py-2">
                    <div className="text-xs font-semibold text-white">{currentUser.name}</div>
                    <div className="truncate font-mono text-[11px] text-slate-400">{currentUser.email}</div>
                    {currentOrg && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400">
                        <Building2 className="h-3 w-3" />
                        <span>{currentOrg.name}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-0.5 pt-1">
                    <button
                      onClick={() => {
                        onOpenBilling();
                        setUserMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-[#131622] hover:text-white"
                    >
                      <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                      Credits & Invoices
                    </button>
                    <button
                      onClick={() => {
                        onLogout();
                        setUserMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuth('login')}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Log In
              </button>
              <button
                onClick={() => onOpenAuth('register')}
                className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                Sign Up Free
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

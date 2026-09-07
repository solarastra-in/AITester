import React, { useState, useEffect } from 'react';
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
  Code2,
  Server
} from 'lucide-react';
import { signInWithGoogle } from '../services/firebase';
import { User, Organization, AppView } from '../types';
import { testApiConnection, getApiBaseUrl } from '../services/api';
import { EngineSettingsModal } from './EngineSettingsModal';

interface NavbarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  currentUser: User | null;
  currentOrg: Organization | null;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenBilling: () => void;
  onSwitchPersona: (role?: string, email?: string) => void;
  onLogout: () => void;
  onGoogleSignInSuccess?: (user: User) => void;
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
  onGoogleSignInSuccess,
}) => {
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false);
  const [engineStatus, setEngineStatus] = useState<{ checked: boolean; ok: boolean; latencyMs?: number }>({
    checked: false,
    ok: false,
  });

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const res = await testApiConnection();
        if (mounted) {
          setEngineStatus({ checked: true, ok: res.ok, latencyMs: res.latencyMs });
        }
      } catch {
        if (mounted) setEngineStatus({ checked: true, ok: false });
      }
    };
    checkStatus();

    const handleUrlChanged = () => {
      checkStatus();
    };
    window.addEventListener('verity_api_url_changed', handleUrlChanged);
    return () => {
      mounted = false;
      window.removeEventListener('verity_api_url_changed', handleUrlChanged);
    };
  }, []);

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
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                currentView === 'home'
                  ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-[#2D334D]'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => onNavigate('features')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                currentView === 'features'
                  ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-[#2D334D]'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              Features
            </button>

            <button
              onClick={() => onNavigate('studio')}
              data-testid="nav-studio"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                currentView === 'studio'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              Studio
            </button>

            <button
              onClick={() => onNavigate('docs')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                currentView === 'docs'
                  ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-[#2D334D]'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              Docs
            </button>

            <button
              onClick={() => onNavigate('pricing')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                currentView === 'pricing'
                  ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-[#2D334D]'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              Pricing
            </button>

            <button
              onClick={() => onNavigate('contact')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                currentView === 'contact'
                  ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-[#2D334D]'
                  : 'text-slate-300 hover:bg-[#131622] hover:text-white'
              }`}
            >
              Contact Us
            </button>

            {isOrgAdmin && (
              <button
                onClick={() => onNavigate('org_admin')}
                data-testid="nav-org-admin"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  currentView === 'org_admin'
                    ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                    : 'text-slate-300 hover:bg-[#131622] hover:text-white'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-amber-400" />
                Org Admin
              </button>
            )}

            {isPlatformAdmin && (
              <button
                onClick={() => onNavigate('super_admin')}
                data-testid="nav-super-admin"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  currentView === 'super_admin'
                    ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                    : 'text-slate-300 hover:bg-[#131622] hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-rose-400" />
                Superadmin
              </button>
            )}
          </nav>
        </div>

        {/* Right Section: Persona Switcher, Engine Config, Balance, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* API Engine Runner Status & Config Button */}
          <button
            type="button"
            onClick={() => setIsEngineModalOpen(true)}
            data-testid="api-engine-button"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              engineStatus.checked && engineStatus.ok
                ? 'border-emerald-500/30 bg-[#0F111A] text-slate-200 hover:border-emerald-500/60 hover:bg-[#131622]'
                : 'border-amber-500/30 bg-[#0F111A] text-amber-200 hover:border-amber-500/60 hover:bg-[#131622]'
            }`}
            title="Configure Verity API Engine Runner URL"
          >
            <Server className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden md:inline text-slate-400">Engine:</span>
            <span className="flex items-center gap-1 font-semibold">
              <span className={`h-2 w-2 rounded-full ${
                engineStatus.checked && engineStatus.ok
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`} />
              <span className={engineStatus.checked && engineStatus.ok ? 'text-emerald-400' : 'text-amber-400'}>
                {engineStatus.checked ? (engineStatus.ok ? 'Online' : 'Offline') : 'Checking...'}
              </span>
            </span>
          </button>

          {/* Quick Persona Switcher for Live Demo & Review */}
          <div className="relative">
            <button
              onClick={() => setPersonaMenuOpen(!personaMenuOpen)}
              data-testid="persona-switcher"
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
                      data-testid={`persona-option-${p.role}`}
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
              data-testid="credits-pill"
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
                data-testid="user-menu-button"
                className="flex items-center gap-2 rounded-full p-0.5 ring-1 ring-[#2D334D] transition hover:ring-emerald-500"
                title={`${currentUser.name} (${currentUser.email})`}
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-emerald-500/50"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-[#1E2235] bg-[#0F111A] p-2 shadow-2xl z-50">
                  <div className="border-b border-[#1E2235] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
                      {currentUser.photoURL && (
                        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-300 border border-blue-500/30">
                          Google
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-[11px] text-slate-400 mt-0.5">{currentUser.email}</div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded border border-emerald-800/40">
                      <span>Cloud Credits:</span>
                      <span className="font-bold">{currentOrg ? currentOrg.creditsBalance : currentUser.creditsBalance}</span>
                    </div>
                    {currentOrg && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-400">
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
                      data-testid="logout-button"
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
                onClick={async () => {
                  try {
                    const u = await signInWithGoogle();
                    if (onGoogleSignInSuccess) onGoogleSignInSuccess(u);
                  } catch (e) {
                    console.error('Google sign in error', e);
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-[#1E2235] bg-[#06070B] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-emerald-500/40 hover:bg-[#131622]"
                title="Sign in with your Google account"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>Sign in with Google</span>
              </button>
              <button
                onClick={() => onOpenAuth('login')}
                className="hidden sm:inline-block rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
              >
                Email Log In
              </button>
            </div>
          )}
        </div>
      </div>

      <EngineSettingsModal
        isOpen={isEngineModalOpen}
        onClose={() => setIsEngineModalOpen(false)}
      />
    </header>
  );
};

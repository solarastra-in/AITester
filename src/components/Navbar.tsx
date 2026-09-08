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
  onSwitchPersona?: (role?: string, email?: string) => void;
  onLogout: () => void;
  onGoogleSignInSuccess?: (user: User) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  currentOrg,
  onOpenAuth,
  onOpenBilling,
  onLogout,
  onGoogleSignInSuccess,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [engineStatus, setEngineStatus] = useState<{
    checked: boolean;
    ok: boolean;
    latencyMs?: number;
    status?: number;
    error?: string;
    lastPolled?: Date;
  }>({
    checked: false,
    ok: false,
  });

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const res = await testApiConnection();
        if (mounted) {
          setEngineStatus({
            checked: true,
            ok: res.ok,
            latencyMs: res.latencyMs,
            status: res.status,
            error: res.error,
            lastPolled: new Date(),
          });
        }
      } catch (err: any) {
        if (mounted) {
          setEngineStatus({
            checked: true,
            ok: false,
            status: 0,
            error: err?.message || 'Connection failed',
            lastPolled: new Date(),
          });
        }
      }
    };

    // Initial check
    checkStatus();

    // Persistent polling of /api/health every 10 seconds
    const pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      checkStatus();
    }, 10000);

    const handleUrlChanged = () => checkStatus();
    const handleVisibilityChange = () => {
      if (!document.hidden) checkStatus();
    };
    const handleOnline = () => checkStatus();
    const handleOpenEngine = () => setIsEngineModalOpen(true);

    window.addEventListener('verity_api_url_changed', handleUrlChanged);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('verity_open_engine_settings', handleOpenEngine);

    return () => {
      mounted = false;
      clearInterval(pollTimer);
      window.removeEventListener('verity_api_url_changed', handleUrlChanged);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('verity_open_engine_settings', handleOpenEngine);
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
          {/* Persistent Backend Status Indicator & Health Poller */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => setIsEngineModalOpen(true)}
              data-testid="backend-status-indicator"
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition shadow-sm ${
                !engineStatus.checked
                  ? 'border-slate-800 bg-[#0E1118] text-slate-400 hover:border-slate-700'
                  : engineStatus.ok
                  ? 'border-emerald-500/40 bg-[#07190F] text-emerald-300 hover:border-emerald-500/70 hover:bg-[#0B2215] ring-1 ring-emerald-500/20'
                  : 'border-red-500/50 bg-[#18090C] text-red-300 hover:border-red-500/80 hover:bg-[#220D12] ring-1 ring-red-500/30'
              }`}
              title="Backend Status: Click to view health details or configure engine runner"
              aria-label={`Backend Status: ${engineStatus.checked ? (engineStatus.ok ? 'Online' : 'Offline') : 'Checking'}`}
            >
              {/* Dynamic status dot */}
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    !engineStatus.checked
                      ? 'bg-slate-500 animate-pulse'
                      : engineStatus.ok
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-red-500 animate-ping'
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    !engineStatus.checked
                      ? 'bg-slate-400'
                      : engineStatus.ok
                      ? 'bg-emerald-400'
                      : 'bg-red-500'
                  }`}
                />
              </span>

              {/* Status Text */}
              <span className="hidden sm:inline font-medium text-slate-400">
                Backend:
              </span>
              <span
                className={`font-semibold tracking-wide ${
                  !engineStatus.checked
                    ? 'text-slate-400'
                    : engineStatus.ok
                    ? 'text-emerald-300'
                    : 'text-red-300'
                }`}
              >
                {!engineStatus.checked
                  ? 'Checking...'
                  : engineStatus.ok
                  ? 'Online'
                  : 'Offline'}
              </span>

              {/* Latency badge when online */}
              {engineStatus.checked && engineStatus.ok && engineStatus.latencyMs !== undefined && (
                <span className="hidden md:inline-flex items-center rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                  {engineStatus.latencyMs}ms
                </span>
              )}
            </button>

            {/* Hover Tooltip / Status Flyout */}
            <div className="absolute right-0 top-full mt-2 hidden group-hover:flex group-focus-within:flex flex-col w-64 rounded-xl border border-[#23293D] bg-[#0C0F17]/95 p-3 shadow-2xl backdrop-blur-md z-50 pointer-events-none text-xs">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                <span className="font-semibold text-white">Backend Health</span>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                    engineStatus.ok
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-red-500/20 text-red-300 border border-red-500/40'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${engineStatus.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {engineStatus.ok ? 'Healthy (200 OK)' : 'Offline / Error'}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Endpoint:</span>
                  <span className="font-mono text-slate-300">/api/health</span>
                </div>
                {engineStatus.latencyMs !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Latency:</span>
                    <span className="font-mono text-emerald-400">{engineStatus.latencyMs} ms</span>
                  </div>
                )}
                {engineStatus.error && (
                  <div className="rounded bg-red-950/40 border border-red-500/20 p-1.5 text-[10px] text-red-300 break-words mt-1">
                    {engineStatus.error}
                  </div>
                )}
                {engineStatus.lastPolled && (
                  <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5">
                    <span>Last polled:</span>
                    <span>{engineStatus.lastPolled.toLocaleTimeString()}</span>
                  </div>
                )}
              </div>

              <div className="mt-2.5 pt-2 border-t border-white/5 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Click to configure runner</span>
                <span className="text-emerald-400 font-mono">10s auto-poll</span>
              </div>
            </div>
          </div>

          {/* User Role Badge (When Authenticated) */}
          {currentUser && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#0F111A] px-2.5 py-1.5 text-xs font-medium text-slate-200">
              <div className="flex h-2 w-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20" />
              <span className="text-slate-400">Role:</span>
              <span className="font-semibold text-white capitalize">
                {currentUser.role === 'platform_admin'
                  ? 'Platform Admin'
                  : currentUser.role === 'org_admin'
                  ? 'Customer Admin'
                  : currentUser.role === 'member'
                  ? 'Team Member'
                  : 'Standalone'}
              </span>
            </div>
          )}

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
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Role:</span>
                      <span className="font-semibold text-emerald-400 capitalize">
                        {currentUser.role.replace('_', ' ')}
                      </span>
                    </div>
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
                disabled={isSigningInGoogle}
                onClick={async () => {
                  if (isSigningInGoogle) return;
                  setIsSigningInGoogle(true);
                  try {
                    const u = await signInWithGoogle();
                    if (u && onGoogleSignInSuccess) onGoogleSignInSuccess(u);
                  } catch (e: any) {
                    if (
                      e?.code !== 'auth/cancelled-popup-request' &&
                      e?.code !== 'auth/popup-closed-by-user' &&
                      !e?.message?.includes('cancelled-popup-request') &&
                      !e?.message?.includes('popup-closed-by-user')
                    ) {
                      console.error('Google sign in error', e);
                    }
                  } finally {
                    setIsSigningInGoogle(false);
                  }
                }}
                className={`flex items-center gap-2 rounded-lg border border-[#1E2235] bg-[#06070B] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-emerald-500/40 hover:bg-[#131622] ${
                  isSigningInGoogle ? 'opacity-60 cursor-wait' : ''
                }`}
                title="Sign in with your Google account"
              >
                {isSigningInGoogle ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                )}
                <span>{isSigningInGoogle ? 'Connecting...' : 'Sign in with Google'}</span>
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

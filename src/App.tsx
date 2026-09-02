import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Homepage } from './components/Homepage';
import { ProjectStudio } from './components/ProjectStudio';
import { OrgAdminView } from './components/OrgAdminView';
import { SuperAdminView } from './components/SuperAdminView';
import { PricingView } from './components/PricingView';
import { BillingModal } from './components/BillingModal';
import { AuthModals } from './components/AuthModals';
import { api, getStoredToken, clearStoredToken } from './services/api';
import { User, Organization } from './types';

export function App() {
  const [currentView, setCurrentView] = useState<'home' | 'studio' | 'org_admin' | 'super_admin' | 'pricing'>('home');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset' | null>(null);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // Load initial authenticated user (or auto-seed first user)
  const fetchCurrentUser = async () => {
    try {
      setIsLoadingUser(true);
      const res = await api.getMe();
      setCurrentUser(res.user);
      setCurrentOrg(res.organization);
    } catch {
      // If no valid session, auto-login default demo persona for seamless zero-barrier development preview
      try {
        const demo = await api.switchPersona('platform_admin');
        setCurrentUser(demo.user);
        setCurrentOrg(demo.organization);
      } catch (err) {
        console.error('Failed to initialize demo persona:', err);
      }
    } finally {
      setIsLoadingUser(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const handleSwitchPersona = async (role?: string, email?: string) => {
    try {
      const res = await api.switchPersona(role, email);
      setCurrentUser(res.user);
      setCurrentOrg(res.organization);
    } catch (err) {
      console.error('Failed to switch persona:', err);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setCurrentUser(null);
    setCurrentOrg(null);
    setCurrentView('home');
  };

  const handleAuthSuccess = (user: User) => {
    fetchCurrentUser();
    if (currentView === 'home') {
      setCurrentView('studio');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0B10] text-[#E2E8F0] flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Navigation Bar */}
      <Navbar
        currentView={currentView}
        onNavigate={setCurrentView}
        currentUser={currentUser}
        currentOrg={currentOrg}
        onOpenAuth={setAuthMode}
        onOpenBilling={() => setIsBillingOpen(true)}
        onSwitchPersona={handleSwitchPersona}
        onLogout={handleLogout}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {currentView === 'home' && (
          <Homepage
            onStartStudio={() => setCurrentView('studio')}
            onOpenPricing={() => setCurrentView('pricing')}
            onSelectPersona={(role, email) => {
              handleSwitchPersona(role, email);
              if (role === 'platform_admin') setCurrentView('super_admin');
              else if (role === 'org_admin') setCurrentView('org_admin');
              else setCurrentView('studio');
            }}
          />
        )}

        {currentView === 'studio' && (
          <ProjectStudio
            currentUser={currentUser}
            currentOrg={currentOrg}
            onOpenBilling={() => setIsBillingOpen(true)}
          />
        )}

        {currentView === 'org_admin' && currentUser && (
          <OrgAdminView
            currentUser={currentUser}
            onOpenBilling={() => setIsBillingOpen(true)}
          />
        )}

        {currentView === 'super_admin' && (
          <SuperAdminView />
        )}

        {currentView === 'pricing' && (
          <PricingView
            onStartStudio={() => setCurrentView('studio')}
            onOpenAuth={setAuthMode}
            onOpenBilling={() => setIsBillingOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1E2235] bg-[#07080D] py-8 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-emerald-400">◈ VERITY</span>
            <span className="text-slate-400">— Interactive Automated Testing & Multi-Cloud Package Delivery</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Self-Hosted Docker: <strong className="text-emerald-400">$0</strong></span>
            <span>•</span>
            <span>Cloud Runs: 1 Credit/Run</span>
            <span>•</span>
            <button onClick={() => setIsBillingOpen(true)} className="hover:text-emerald-400 transition">
              Credits & Billing
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <BillingModal
        isOpen={isBillingOpen}
        onClose={() => setIsBillingOpen(false)}
        onBalanceUpdated={fetchCurrentUser}
      />

      <AuthModals
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onSuccess={handleAuthSuccess}
        onSwitchMode={setAuthMode}
      />
    </div>
  );
}
export default App;

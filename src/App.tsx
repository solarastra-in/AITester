import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Homepage } from './components/Homepage';
import { ProjectStudio } from './components/ProjectStudio';
import { OrgAdminView } from './components/OrgAdminView';
import { SuperAdminView } from './components/SuperAdminView';
import { PricingView } from './components/PricingView';
import { ContactView } from './components/ContactView';
import { FeaturesView } from './components/FeaturesView';
import { DocsView } from './components/DocsView';
import { AboutView } from './components/AboutView';
import { BillingModal } from './components/BillingModal';
import { AuthModals } from './components/AuthModals';
import { api, clearStoredToken } from './services/api';
import { subscribeAuthState, signOutGoogle, ensureFirestoreInitialized } from './services/firebase';
import { User, Organization, AppView } from './types';

const SITE_ORIGIN = 'https://ais-pre-zxirjfnjh6bl2ylg7svoja-4552824319.us-west2.run.app';

// Real, crawlable path for every view (used for pushState routing, canonical
// links, and og:url) instead of hash fragments, which search engines largely
// don't index as distinct pages.
const VIEW_PATHS: Record<AppView, string> = {
  home: '/',
  studio: '/studio',
  features: '/features',
  docs: '/docs',
  pricing: '/pricing',
  contact: '/contact',
  about: '/about',
  org_admin: '/org-admin',
  super_admin: '/super-admin',
};

const PATH_TO_VIEW: Record<string, AppView> = Object.entries(VIEW_PATHS).reduce(
  (acc, [view, path]) => ({ ...acc, [path]: view as AppView }),
  {} as Record<string, AppView>
);

// Views that are real logged-in application surfaces rather than public
// marketing/informational pages — these are excluded from indexing.
const NOINDEX_VIEWS: AppView[] = ['studio', 'org_admin', 'super_admin'];

const VIEW_TITLES: Record<AppView, string> = {
  home: 'Verity — Zero-Dummy-Data QA Automation, Live Network Introspection & Multi-Cloud Docker Delivery',
  studio: 'Interactive QA Studio — Verity Automated Test Platform',
  features: 'Architectural Features & 0-Gap Testing — Verity QA Platform',
  docs: 'Developer Documentation & Specification Schema — Verity QA Platform',
  pricing: 'Pricing, Self-Hosted Docker & Hosted Cloud Runners — Verity QA Platform',
  contact: 'Contact Engineering Solutions & Support — Verity QA Platform',
  about: 'About Mission, Zero-Trust Architecture & Security — Verity QA Platform',
  org_admin: 'Organization Customer Admin — Verity QA Platform',
  super_admin: 'Platform Superadmin — Verity QA Platform',
};

const VIEW_DESCRIPTIONS: Record<AppView, string> = {
  home: 'Zero-dummy-data automated test execution engine, live network URL introspection, dynamic dataset builder, multi-cloud Docker package generator, and multi-tenant admin platform.',
  studio: 'Build and run automated test suites interactively: upload or AI-generate test cases, resolve live parameters, and execute against your real environment.',
  features: 'Explore Verity\'s architecture: 0-gap parameterized datasets, live network introspection, and self-contained Docker packaging that replaces brittle mock-data test suites.',
  docs: 'Developer documentation for Verity\'s test specification schema, live introspection API, and Docker export format.',
  pricing: 'Verity pricing: run unlimited tests self-hosted via Docker for free, or use the hosted cloud runner billed per execution credit.',
  contact: 'Contact Verity engineering and solutions support for onboarding, enterprise deployment, or technical questions.',
  about: 'Verity\'s mission: eliminate flaky, dummy-data-driven test suites with real-time network introspection and zero-trust security architecture.',
  org_admin: 'Organization administration for Verity customers: manage teams, credits, and security configuration.',
  super_admin: 'Platform-wide administration for Verity operators.',
};

export function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset' | null>(null);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // Sync currentView with the real URL path (pushState-based routing) so every
  // view is a distinct, crawlable, bookmarkable URL rather than a hash fragment.
  useEffect(() => {
    const parseLocation = (): AppView => {
      // Back-compat: old links may still use #studio etc. — honor them once,
      // then normalize to the real path below.
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash && PATH_TO_VIEW[`/${hash}`]) {
        return PATH_TO_VIEW[`/${hash}`];
      }
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      return PATH_TO_VIEW[path] || 'home';
    };

    const initialView = parseLocation();
    if (initialView !== 'home') {
      setCurrentView(initialView);
      // Normalize any old hash-based URL to its real path immediately.
      if (window.location.hash) {
        history.replaceState(null, '', VIEW_PATHS[initialView]);
      }
    }

    const handlePopState = () => {
      setCurrentView(parseLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update document title + meta description/canonical/OG/Twitter tags and
  // robots directives for the active view. This keeps SEO metadata accurate
  // per-page instead of always showing the homepage's tags.
  useEffect(() => {
    document.title = VIEW_TITLES[currentView] || VIEW_TITLES.home;

    const description = VIEW_DESCRIPTIONS[currentView] || VIEW_DESCRIPTIONS.home;
    const url = `${SITE_ORIGIN}${VIEW_PATHS[currentView] || '/'}`;
    const shouldIndex = !NOINDEX_VIEWS.includes(currentView);

    const setMeta = (selector: string, attr: string, value: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };

    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', VIEW_TITLES[currentView]);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[name="twitter:title"]', 'content', VIEW_TITLES[currentView]);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta(
      'meta[name="robots"]',
      'content',
      shouldIndex ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' : 'noindex, nofollow'
    );

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', url);
  }, [currentView]);

  const handleNavigate = (view: AppView) => {
    setCurrentView(view);
    history.pushState(null, '', VIEW_PATHS[view] || '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Initialize Firestore datasets and listen to Google Auth state
  useEffect(() => {
    ensureFirestoreInitialized();

    const unsubscribe = subscribeAuthState((googleUser) => {
      if (googleUser) {
        setCurrentUser(googleUser);
        setIsLoadingUser(false);
      } else {
        fetchCurrentUser();
      }
    });

    return () => unsubscribe();
  }, []);

  // Load initial authenticated user (or auto-seed first user)
  const fetchCurrentUser = async () => {
    try {
      setIsLoadingUser(true);
      const res = await api.getMe();
      setCurrentUser(res.user);
      setCurrentOrg(res.organization);
    } catch {
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

  const handleSwitchPersona = async (role?: string, email?: string) => {
    try {
      const res = await api.switchPersona(role, email);
      setCurrentUser(res.user);
      setCurrentOrg(res.organization);
    } catch (err) {
      console.error('Failed to switch persona:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutGoogle();
    } catch (e) {
      console.warn('Firebase signout warning', e);
    }
    clearStoredToken();
    setCurrentUser(null);
    setCurrentOrg(null);
    handleNavigate('home');
  };

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    if (currentView === 'home') {
      handleNavigate('studio');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0B10] text-[#E2E8F0] flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Navigation Bar */}
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
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
            onStartStudio={() => handleNavigate('studio')}
            onOpenPricing={() => handleNavigate('pricing')}
            onOpenFeatures={() => handleNavigate('features')}
            onOpenDocs={() => handleNavigate('docs')}
            onOpenContact={() => handleNavigate('contact')}
            onSelectPersona={(role, email) => {
              handleSwitchPersona(role, email);
              if (role === 'platform_admin') handleNavigate('super_admin');
              else if (role === 'org_admin') handleNavigate('org_admin');
              else handleNavigate('studio');
            }}
          />
        )}

        {currentView === 'features' && (
          <FeaturesView
            onStartStudio={() => handleNavigate('studio')}
            onOpenPricing={() => handleNavigate('pricing')}
            onOpenContact={() => handleNavigate('contact')}
          />
        )}

        {currentView === 'docs' && (
          <DocsView
            onStartStudio={() => handleNavigate('studio')}
            onOpenContact={() => handleNavigate('contact')}
          />
        )}

        {currentView === 'studio' && (
          <ProjectStudio
            currentUser={currentUser}
            currentOrg={currentOrg}
            onOpenBilling={() => setIsBillingOpen(true)}
          />
        )}

        {currentView === 'pricing' && (
          <PricingView
            onStartStudio={() => handleNavigate('studio')}
            onOpenAuth={setAuthMode}
            onOpenBilling={() => setIsBillingOpen(true)}
          />
        )}

        {currentView === 'contact' && (
          <ContactView
            onStartStudio={() => handleNavigate('studio')}
            onOpenPricing={() => handleNavigate('pricing')}
          />
        )}

        {currentView === 'about' && (
          <AboutView
            onStartStudio={() => handleNavigate('studio')}
            onOpenContact={() => handleNavigate('contact')}
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
      </main>

      {/* SEO-Enhanced Multi-Column Footer */}
      <footer className="border-t border-[#1E2235] bg-[#07080D] pt-12 pb-8 text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Column 1: Brand & Tagline */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-black font-mono">
                  ◈
                </div>
                <span className="font-bold text-white text-base tracking-tight">VERITY QA</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Enterprise automated test execution platform. Live URL network introspection, 0-gap dynamic datasets, and self-contained Docker package delivery for modern distributed architectures.
              </p>
              <div className="text-[11px] text-emerald-400 font-mono">
                100% Zero Dummy Data Guarantee
              </div>
            </div>

            {/* Column 2: Product & Capabilities */}
            <div>
              <h4 className="font-semibold text-white mb-3 text-xs uppercase tracking-wider">Product & Capabilities</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={() => handleNavigate('studio')} className="hover:text-emerald-400 transition">
                    Interactive Studio
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('features')} className="hover:text-emerald-400 transition">
                    Live URL Introspection
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('features')} className="hover:text-emerald-400 transition">
                    0-Gap Parameter Datasets
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('features')} className="hover:text-emerald-400 transition">
                    Standalone Docker Packaging
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('pricing')} className="hover:text-emerald-400 transition">
                    Pricing & Credits ($0 Self-Hosted)
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Documentation & Guides */}
            <div>
              <h4 className="font-semibold text-white mb-3 text-xs uppercase tracking-wider">Documentation & Guides</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={() => handleNavigate('docs')} className="hover:text-emerald-400 transition">
                    Quick Start Guide (60 Seconds)
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('docs')} className="hover:text-emerald-400 transition">
                    Test Spec Schema (HTTP/Load)
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('docs')} className="hover:text-emerald-400 transition">
                    Docker CLI & CI/CD Pipelines
                  </button>
                </li>
                <li>
                  <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">
                    XML Sitemap
                  </a>
                </li>
                <li>
                  <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">
                    robots.txt Indexing Spec
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 4: Enterprise & Support */}
            <div>
              <h4 className="font-semibold text-white mb-3 text-xs uppercase tracking-wider">Enterprise & Support</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={() => handleNavigate('contact')} className="hover:text-emerald-400 transition font-semibold text-emerald-300">
                    Contact Engineering Support
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('about')} className="hover:text-emerald-400 transition">
                    Security & SOC-2 Compliance
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('about')} className="hover:text-emerald-400 transition">
                    Zero-Trust Credential Isolation
                  </button>
                </li>
                <li>
                  <span className="text-slate-500">Global Support: </span>
                  <a href="mailto:support@verity-qa.dev" className="text-emerald-400 hover:underline">
                    support@verity-qa.dev
                  </a>
                </li>
                <li>
                  <button onClick={() => setIsBillingOpen(true)} className="hover:text-emerald-400 transition">
                    Manage Cloud Credits & Ledgers
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-[#1E2235] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <div>
              © {new Date().getFullYear()} Verity QA Platform. All rights reserved. Zero dummy data testing framework.
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => handleNavigate('about')} className="hover:text-slate-300 transition">
                Privacy Policy
              </button>
              <span>•</span>
              <button onClick={() => handleNavigate('about')} className="hover:text-slate-300 transition">
                Security Architecture
              </button>
              <span>•</span>
              <button onClick={() => handleNavigate('contact')} className="hover:text-slate-300 transition">
                SLA Guarantees
              </button>
            </div>
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


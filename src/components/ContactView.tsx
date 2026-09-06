import React, { useState } from 'react';
import {
  Mail,
  Building2,
  Send,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Shield,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Headphones,
  Globe,
  Terminal,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';
import { db } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface ContactViewProps {
  onStartStudio: () => void;
  onOpenPricing: () => void;
}

const FAQ_ITEMS = [
  {
    q: 'How does Verity guarantee that no dummy data is used in test cases?',
    a: 'Verity uses real-time network introspection and our 4-step guided journey to probe your actual application routes, response headers, SSL configurations, and real endpoints (e.g. /sitemap.xml, /robots.txt, live REST endpoints). Instead of fake placeholder strings, Verity creates a 0-gap parameter dataset bound directly to your production or staging domain.',
  },
  {
    q: 'Can Verity test cases run inside isolated private VPCs or behind enterprise VPNs?',
    a: 'Yes. With our self-contained Docker bundle, you can download a complete, standalone test execution package that runs locally, inside your private AWS VPC, Google Cloud Run, Azure Container Instances, or Kubernetes cluster with zero outbound dependencies.',
  },
  {
    q: 'How does the 4-step Interactive URL Introspection Journey work?',
    a: 'Enter any target URL (such as your API or SPA). In Step 1, Verity probes the live host and analyzes tech stack and architecture. In Step 2, Verity asks targeted questions to discover required auth personas, models, and parameters. In Step 3, you provide custom rules and routes. In Step 4, Verity synthesizes an executable test suite and zero-gap dataset.',
  },
  {
    q: 'What SLA guarantees do you provide for Enterprise organizations?',
    a: 'Enterprise plan customers receive a dedicated Slack/Teams connect channel, a named QA Solutions Architect, guaranteed sub-1 hour response SLA for critical incidents, and 99.95% uptime guarantees for hosted cloud execution runners.',
  },
  {
    q: 'How are sensitive tokens and auth credentials stored?',
    a: 'All authentication tokens and secrets are stored in project datasets with zero-trust token masking. In exportable Docker bundles, tokens are passed at container invocation via environment variables or secret managers, ensuring credentials never touch public version control.',
  },
];

export const ContactView: React.FC<ContactViewProps> = ({ onStartStudio, onOpenPricing }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [category, setCategory] = useState('Enterprise Dedicated Cluster & VPC Deployment');
  const [priority, setPriority] = useState<'Standard' | 'Expedited' | 'Critical SLA'>('Standard');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    try {
      setIsSubmitting(true);

      // 1. Submit to Backend API
      const res = await api.submitContact({
        name,
        email,
        company,
        category,
        message,
        priority,
      });

      // 2. Persist to Firestore for durable record
      try {
        await addDoc(collection(db, 'contact_inquiries'), {
          ticketId: res.ticketId,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          company: company.trim(),
          category,
          priority,
          message: message.trim(),
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      } catch (firestoreErr) {
        console.warn('Firestore direct write notice:', firestoreErr);
      }

      setSubmittedTicket(res.ticketId);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit your inquiry. Please try again or email us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setName('');
    setEmail('');
    setCompany('');
    setMessage('');
    setSubmittedTicket(null);
    setErrorMessage(null);
  };

  return (
    <div className="relative min-h-screen bg-[#07080D] text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-emerald-500/10 blur-[130px] rounded-full" />
        <div className="absolute top-1/3 -right-40 w-[400px] h-[400px] bg-teal-500/10 blur-[140px] rounded-full" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Breadcrumb Navigation for SEO */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-400">
          <a href="#home" className="hover:text-emerald-400 transition">Verity QA Platform</a>
          <span>/</span>
          <span className="text-emerald-400 font-semibold">Contact Solutions & Support</span>
        </nav>

        {/* Header Hero */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 mb-4">
            <Headphones className="h-3.5 w-3.5 text-emerald-400" />
            <span>24/7 Global QA Engineering & Solutions Desk</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
            Contact Verity Engineering & Support
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Need an enterprise cluster, custom protocol integration, or assistance building a 0-gap test suite for your domain? Our automated testing specialists are ready to help.
          </p>
        </div>

        {/* Main Grid: Form + Contact Channels */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          {/* Left: Contact Form (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 sm:p-8 shadow-xl">
            {submittedTicket ? (
              <div className="text-center py-10 space-y-4">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-2">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-white">Inquiry Registered Successfully</h2>
                <div className="inline-block rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 font-mono text-sm font-bold text-emerald-300">
                  Ticket Reference: {submittedTicket}
                </div>
                <p className="text-sm text-slate-300 max-w-md mx-auto">
                  Thank you for reaching out. A confirmation has been registered in the system audit log. Our QA solutions engineering team will review your requirements and respond within your SLA window.
                </p>
                <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={handleResetForm}
                    className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B] transition"
                  >
                    Submit Another Inquiry
                  </button>
                  <button
                    onClick={onStartStudio}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                  >
                    <span>Open Interactive Studio</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-400" />
                    <span>Send Us a Direct Message</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Fill out the specifications below. All enterprise inquiries receive priority routing.
                  </p>
                </div>

                {errorMessage && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {errorMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Your Name <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Sarah Chen"
                      className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Business Email <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="sarah@company.com"
                      className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Company or Project Name
                    </label>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Acme Cloud Solutions"
                      className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Priority SLA
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                      className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="Standard">Standard (Within 24 Hours)</option>
                      <option value="Expedited">Expedited (Within 4 Hours)</option>
                      <option value="Critical SLA">Critical Production SLA (Sub-1 Hour)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Inquiry Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Enterprise Dedicated Cluster & VPC Deployment">Enterprise Dedicated Cluster & VPC Deployment</option>
                    <option value="Technical QA Automation & Framework Support">Technical QA Automation & Framework Support</option>
                    <option value="Model Routing & Custom Protocol Integration">Model Routing & Custom Protocol Integration</option>
                    <option value="Security, SOC-2 Compliance & Data Privacy">Security, SOC-2 Compliance & Data Privacy</option>
                    <option value="Billing, Enterprise Invoicing & Credit Grants">Billing, Enterprise Invoicing & Credit Grants</option>
                    <option value="General Feedback & Feature Proposal">General Feedback & Feature Proposal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Message & Requirements <span className="text-emerald-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your testing environment, target domain (e.g. https://ai.whyor.in), concurrency targets, or custom integration questions..."
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <Shield className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Zero-spam guarantee & encrypted data handling</span>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span>Registering Ticket...</span>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Send Message</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Right: Channels & Regions (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Direct Channels Card */}
            <div className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 shadow-xl space-y-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" />
                <span>Direct Support Channels</span>
              </h2>

              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3 flex items-start gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400 border border-emerald-500/20">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Enterprise Engineering Desk</div>
                    <div className="font-mono text-emerald-400 text-[11px] select-all">enterprise@verity-qa.dev</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">24/7/365 dedicated queue • Sub-1 hour SLA</div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3 flex items-start gap-3">
                  <div className="rounded-lg bg-teal-500/10 p-2 text-teal-400 border border-teal-500/20">
                    <Headphones className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Technical QA Solutions</div>
                    <div className="font-mono text-teal-400 text-[11px] select-all">support@verity-qa.dev</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Mon–Fri 08:00–20:00 UTC • Same-day resolution</div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3 flex items-start gap-3">
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400 border border-amber-500/20">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Security & Compliance Office</div>
                    <div className="font-mono text-amber-400 text-[11px] select-all">security@verity-qa.dev</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">SOC-2, HIPAA, & vulnerability disclosure</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Global Test Infrastructure Nodes */}
            <div className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 shadow-xl space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />
                <span>Hosted Runner Infrastructure</span>
              </h2>
              <p className="text-xs text-slate-300">
                Our distributed runners execute tests closest to your origin servers for minimal network jitter:
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="rounded-lg border border-[#1E2235] bg-[#06070B] p-2 text-slate-300">
                  <span className="text-emerald-400 font-bold">us-east-1</span> (N. Virginia)
                </div>
                <div className="rounded-lg border border-[#1E2235] bg-[#06070B] p-2 text-slate-300">
                  <span className="text-emerald-400 font-bold">us-west-2</span> (Oregon)
                </div>
                <div className="rounded-lg border border-[#1E2235] bg-[#06070B] p-2 text-slate-300">
                  <span className="text-emerald-400 font-bold">eu-central-1</span> (Frankfurt)
                </div>
                <div className="rounded-lg border border-[#1E2235] bg-[#06070B] p-2 text-slate-300">
                  <span className="text-emerald-400 font-bold">ap-south-1</span> (Mumbai)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive FAQ Accordion */}
        <div className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 sm:p-8 shadow-xl mb-12">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-emerald-400" />
              <span>Frequently Asked Questions</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Common questions about automated test generation, real data guarantees, and multi-cloud deployment.
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-[#1E2235] bg-[#06070B] overflow-hidden transition"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-4 text-left text-xs sm:text-sm font-semibold text-white hover:text-emerald-300 transition"
                  >
                    <span>{item.q}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-emerald-400 shrink-0 ml-2" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-[#1E2235]/60 pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Call to action footer banner */}
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-white">Ready to test with real-world accuracy?</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Launch the Interactive Introspection Journey on your website or API. Zero dummy data, zero setup friction, download self-contained Docker packages in seconds.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenPricing}
              className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B] transition"
            >
              View Pricing Tiers
            </button>
            <button
              onClick={onStartStudio}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Launch Studio Free</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

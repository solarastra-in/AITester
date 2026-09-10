import React, { useState } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Layers,
  ShieldCheck,
  BookOpen,
  Wand2,
  Code,
  CheckCircle2,
} from 'lucide-react';

interface TourStep {
  title: string;
  badge: string;
  description: string;
  visualIcon: React.ReactNode;
  bulletPoints: string[];
}

interface DatasetGuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const DatasetGuidedTour: React.FC<DatasetGuidedTourProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: TourStep[] = [
    {
      title: 'Welcome to Dataset Management',
      badge: 'Step 1 of 5 • Dynamic Variables',
      description:
        'Verity separates your test logic from your environment data. Dynamic variables like {{authTokens.admin}} and {{apiUrl}} are replaced at runtime without changing your test cases.',
      visualIcon: <Layers className="w-6 h-6 text-blue-500" />,
      bulletPoints: [
        'Eliminate hardcoded secrets and tokens from your test suites',
        'Support multiple user roles (Admin, Member, Guest) seamlessly',
        'Reuse the same automated suite across Local, Staging, and Production',
      ],
    },
    {
      title: 'Real-Time Data Quality & Validation',
      badge: 'Step 2 of 5 • Quality Assurance',
      description:
        'Every variable is continuously audited against security standards and test requirements. The system alerts you to malformed JWTs, missing Bearer prefixes, or trailing slashes.',
      visualIcon: <ShieldCheck className="w-6 h-6 text-emerald-500" />,
      bulletPoints: [
        'Instant quality indicators (Valid, Quality Warning, Missing)',
        'One-click "Auto-Fix" normalizes formatting issues immediately',
        'Quality Index score ensures high fidelity before test runs',
      ],
    },
    {
      title: 'Visual Guided Learning & Step-by-Step Instructions',
      badge: 'Step 3 of 5 • Guided How-To',
      description:
        'Unsure where to find a credential or ID? Click "How To Get" on any variable card to open high-fidelity visual mockups of Chrome DevTools, LocalStorage, and Swagger UI.',
      visualIcon: <BookOpen className="w-6 h-6 text-purple-500" />,
      bulletPoints: [
        'Detailed steps tailored to your website domain and API',
        'Visual screenshot mockups show exact headers and keys to copy',
        'One-click cURL commands to extract real data straight from your terminal',
      ],
    },
    {
      title: 'AI Mock Synthesis & Fixture Generation',
      badge: 'Step 4 of 5 • Smart Synthesis',
      description:
        'Need quick test fixtures before your staging API is ready? Use "Generate Mock" to automatically synthesize schema-compliant tokens, entity IDs, and realistic payloads.',
      visualIcon: <Wand2 className="w-6 h-6 text-amber-500" />,
      bulletPoints: [
        'Generates role-specific JWTs and entity identifiers',
        'Auto-populates missing placeholders detected in test cases',
        'Easily swap synthetic mocks with authentic tokens anytime',
      ],
    },
    {
      title: 'Visual Forms & Raw JSON Synchronization',
      badge: 'Step 5 of 5 • Flexible Editing',
      description:
        'Switch between the intuitive Visual Form interface and full Raw JSON view with a single click. Edits are always synchronized safely and saved to your project.',
      visualIcon: <Code className="w-6 h-6 text-indigo-500" />,
      bulletPoints: [
        'Organized into logical groups (Auth Personas, Dynamic IDs, Environment)',
        'Raw JSON editor allows bulk copy-pasting of complex datasets',
        'Preset packs for E-Commerce, SaaS, and REST APIs',
      ],
    },
  ];

  if (!isOpen) return null;

  const step = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div
      id="dataset-tour-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div
        id="dataset-tour-card"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/50">
              {step.visualIcon}
            </div>
            <div>
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                {step.badge}
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {step.title}
              </h3>
            </div>
          </div>
          <button
            id="btn-close-tour"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {step.description}
          </p>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Key Capabilities:
            </span>
            {step.bulletPoints.map((bp, i) => (
              <div key={i} className="flex items-start space-x-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{bp}</span>
              </div>
            ))}
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center space-x-1.5 pt-2">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentStep
                    ? 'w-6 bg-blue-600 dark:bg-blue-400'
                    : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <button
            id="btn-skip-tour"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Skip Tour
          </button>

          <div className="flex items-center space-x-2">
            {currentStep > 0 && (
              <button
                id="btn-prev-tour"
                onClick={handlePrev}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
            <button
              id="btn-next-tour"
              onClick={handleNext}
              className="flex items-center space-x-1 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <span>{currentStep === steps.length - 1 ? 'Start Configuring' : 'Next'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  Terminal,
  Layers,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Info,
  Wand2,
} from 'lucide-react';
import { DatasetFieldValidationResult } from '../types';
import { api } from '../services/api';

interface DatasetGuidedLearningModalProps {
  isOpen: boolean;
  onClose: () => void;
  variableKey: string;
  currentValue: any;
  siteUrl: string;
  projectId: string;
  onApplyValue: (key: string, newValue: any) => void;
}

export const DatasetGuidedLearningModal: React.FC<DatasetGuidedLearningModalProps> = ({
  isOpen,
  onClose,
  variableKey,
  currentValue,
  siteUrl,
  projectId,
  onApplyValue,
}) => {
  const [loading, setLoading] = useState(false);
  const [guideData, setGuideData] = useState<DatasetFieldValidationResult | null>(null);
  const [inputValue, setInputValue] = useState(currentValue !== undefined && currentValue !== null ? String(currentValue) : '');
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual_guide' | 'steps' | 'extract_curl'>('visual_guide');
  const [inlineFeedback, setInlineFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && variableKey) {
      setInputValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : '');
      loadGuide();
    }
  }, [isOpen, variableKey, currentValue]);

  const loadGuide = async () => {
    try {
      setLoading(true);
      const res = await api.getDatasetFieldGuide(projectId, variableKey, currentValue);
      setGuideData(res);
    } catch (err) {
      console.error('Failed to load dataset guide', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleCopy = (text: string, type: 'curl' | 'snippet') => {
    navigator.clipboard.writeText(text);
    if (type === 'curl') {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } else {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const handleApply = () => {
    onApplyValue(variableKey, inputValue);
    setInlineFeedback('Saved to dataset successfully!');
    setTimeout(() => {
      setInlineFeedback(null);
      onClose();
    }, 700);
  };

  const handleApplyNormalized = () => {
    if (guideData?.normalizedValue) {
      setInputValue(String(guideData.normalizedValue));
      onApplyValue(variableKey, guideData.normalizedValue);
      setInlineFeedback('Auto-fixed and saved to dataset!');
      setTimeout(() => {
        setInlineFeedback(null);
        onClose();
      }, 700);
    }
  };

  const guide = guideData?.guide;

  return (
    <div
      id="dataset-guided-learning-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="dataset-guided-learning-modal"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  Guided Learning & Quality
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold">
                  {`{{${variableKey}}}`}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                How to Provide Data for {variableKey}
              </h2>
            </div>
          </div>
          <button
            id="btn-close-guided-learning-modal"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-6 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
          <button
            id="tab-visual-guide"
            onClick={() => setActiveTab('visual_guide')}
            className={`flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === 'visual_guide'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Visual Screenshot & Location</span>
          </button>
          <button
            id="tab-steps"
            onClick={() => setActiveTab('steps')}
            className={`flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === 'steps'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Step-by-Step Instructions</span>
          </button>
          {guide?.suggestedExtractionCurl && (
            <button
              id="tab-extract-curl"
              onClick={() => setActiveTab('extract_curl')}
              className={`flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab === 'extract_curl'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>1-Click Extraction cURL</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-slate-500">Generating AI contextual guide...</p>
            </div>
          ) : (
            <>
              {/* Quality & Issues Callout if any */}
              {guideData && guideData.issues.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start justify-between">
                  <div className="flex items-start space-x-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Data Quality Notice
                      </h4>
                      <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 mt-1 list-disc list-inside">
                        {guideData.issues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {guideData.normalizedValue && (
                    <button
                      id="btn-apply-recommended-fix"
                      onClick={handleApplyNormalized}
                      className="ml-3 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 shadow-sm transition flex items-center space-x-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Auto-Fix</span>
                    </button>
                  )}
                </div>
              )}

              {/* Context Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <Info className="w-3.5 h-3.5 text-blue-500" />
                    <span>Why this data is required</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {guide?.whyNeeded || 'Essential runtime fixture for automated test cases.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Where to find this in your system</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {guide?.whereToFind || `Inspect ${siteUrl} Network tab or staging environment.`}
                  </p>
                </div>
              </div>

              {/* TAB 1: Visual Screenshot & Mock Preview */}
              {activeTab === 'visual_guide' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Visual Reference Mockup: {guide?.mockPreview.title}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target: {siteUrl || 'https://example.com'}
                    </span>
                  </div>

                  {/* High-Fidelity Visual DevTools/Browser Mock */}
                  <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 shadow-md bg-slate-900 text-slate-200 font-mono text-xs">
                    {/* DevTools Title Bar */}
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 text-[11px] text-slate-400 select-none">
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 inline-block" />
                        </div>
                        <span className="font-semibold text-slate-300 ml-2">
                          DevTools — Elements | Console | Sources | <span className="text-blue-400 underline">Network</span> | Application
                        </span>
                      </div>
                      <span className="text-slate-400">{guide?.mockPreview.subtitle}</span>
                    </div>

                    {/* Screenshot Body */}
                    <div className="p-4 bg-slate-950/90 leading-relaxed overflow-x-auto">
                      <pre className="text-emerald-400 text-xs whitespace-pre-wrap selection:bg-blue-600 selection:text-white">
                        {guide?.mockPreview.snippet}
                      </pre>
                    </div>

                    <div className="px-3 py-2 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Tip: Highlight and copy the highlighted credential directly from Chrome DevTools</span>
                      <button
                        onClick={() => handleCopy(guide?.mockPreview.snippet || '', 'snippet')}
                        className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition"
                      >
                        {copiedSnippet ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSnippet ? 'Copied Sample' : 'Copy Sample'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Step-by-Step Instructions */}
              {activeTab === 'steps' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Step-by-Step Data Retrieval Walkthrough
                  </h4>
                  <div className="space-y-2.5">
                    {guide?.steps.map((step, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start space-x-3"
                      >
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {step.stepNumber}
                        </div>
                        <div className="flex-1 space-y-1">
                          <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                            {step.title}
                          </h5>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {step.description}
                          </p>
                          {step.codeSnippet && (
                            <div className="mt-2 p-2.5 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] relative overflow-x-auto">
                              <code>{step.codeSnippet}</code>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: 1-Click Extraction cURL */}
              {activeTab === 'extract_curl' && guide?.suggestedExtractionCurl && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Terminal Command to Fetch Real Data
                    </span>
                    <button
                      id="btn-copy-curl-extract"
                      onClick={() => handleCopy(guide.suggestedExtractionCurl!, 'curl')}
                      className="flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                    >
                      {copiedCurl ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCurl ? 'Copied to Clipboard!' : 'Copy cURL'}</span>
                    </button>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-slate-800">
                    <pre className="whitespace-pre-wrap">{guide.suggestedExtractionCurl}</pre>
                  </div>
                  <p className="text-xs text-slate-500">
                    Paste this into your local terminal to automatically query your target API and output the exact token or ID needed.
                  </p>
                </div>
              )}

              {/* Interactive In-Modal Data Input & Live Validator */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Set Value for <span className="font-mono text-blue-600 dark:text-blue-400">{`{{${variableKey}}}`}</span>
                  </label>
                  {guideData && (
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        guideData.status === 'valid'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : guideData.status === 'warning'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                          : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      Quality Score: {guideData.score}% ({guideData.status.toUpperCase()})
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    id="input-guided-dataset-value"
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    placeholder={`e.g. ${guideData?.normalizedValue || 'Paste authentic staging value...'}`}
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition pr-24"
                  />
                  {guideData?.normalizedValue && inputValue !== guideData.normalizedValue && (
                    <button
                      type="button"
                      onClick={() => setInputValue(String(guideData.normalizedValue))}
                      className="absolute right-2 top-1.5 px-2 py-1 text-[10px] font-bold bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/60 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition"
                    >
                      Use Fix
                    </button>
                  )}
                </div>

                {inlineFeedback && (
                  <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{inlineFeedback}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <button
            id="btn-cancel-guided-learning"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <div className="flex items-center space-x-2">
            <button
              id="btn-apply-guided-learning"
              onClick={handleApply}
              disabled={loading}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply to Dataset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

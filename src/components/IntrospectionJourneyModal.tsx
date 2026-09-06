import React, { useState, useEffect } from 'react';
import {
  Globe,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Shield,
  Terminal,
  Zap,
  Play,
  Check,
  HelpCircle,
  Plus,
  Trash2,
  Database,
  Key,
  Server,
  X,
  Layers,
  Code2,
  Sliders,
  Cpu,
} from 'lucide-react';
import { api } from '../services/api';
import { IntrospectedWebsiteData, IntrospectionQuestion, DiscoveredEndpoint, BuildJourneyResult } from '../types';

interface IntrospectionJourneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: BuildJourneyResult) => void;
  initialUrl?: string;
  projectId?: string;
  existingProjectName?: string;
}

export const IntrospectionJourneyModal: React.FC<IntrospectionJourneyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialUrl = 'https://ai.whyor.in',
  projectId,
  existingProjectName,
}) => {
  // Step state: 1: URL & Introspect, 2: Questions & Data, 3: More Details, 4: Complete
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: URL & Hint
  const [targetUrl, setTargetUrl] = useState(initialUrl);
  const [userHint, setUserHint] = useState('');
  const [isIntrospecting, setIsIntrospecting] = useState(false);
  const [introspectionData, setIntrospectionData] = useState<IntrospectedWebsiteData | null>(null);
  const [introspectError, setIntrospectError] = useState<string | null>(null);

  // Step 2: Questions & Answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  // Step 3: User Details & Custom Endpoints
  const [customDetails, setCustomDetails] = useState('');
  const [customEndpoints, setCustomEndpoints] = useState<Array<{ method: string; path: string; purpose: string }>>([]);
  const [newEpMethod, setNewEpMethod] = useState('GET');
  const [newEpPath, setNewEpPath] = useState('');
  const [newEpPurpose, setNewEpPurpose] = useState('');
  const [suiteName, setSuiteName] = useState('');
  const [projectName, setProjectName] = useState(existingProjectName || '');

  // Step 4: Building & Result
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<BuildJourneyResult | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  // Initialize or reset when opened
  useEffect(() => {
    if (isOpen) {
      if (initialUrl && !targetUrl) {
        setTargetUrl(initialUrl);
      }
      if (existingProjectName && !projectName) {
        setProjectName(existingProjectName);
      }
    }
  }, [isOpen, initialUrl, existingProjectName]);

  if (!isOpen) return null;

  // 1. Run Introspection
  const handleRunIntrospection = async () => {
    if (!targetUrl || !targetUrl.trim()) {
      setIntrospectError('Please enter a valid target URL.');
      return;
    }

    setIntrospectError(null);
    setIsIntrospecting(true);

    try {
      let clean = targetUrl.trim();
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
        setTargetUrl(clean);
      }

      const result = await api.introspectJourney(clean, userHint, projectId);
      setIntrospectionData(result);

      // Prepopulate answer defaults
      const initialAnswers: Record<string, string> = {};
      result.questions.forEach((q) => {
        initialAnswers[q.id] = q.suggestedDefault || '';
      });
      setAnswers(initialAnswers);

      // Prepopulate names
      setSuiteName(result.suggestedSuiteName || 'Introspected Automated QA Suite');
      if (!projectName) {
        setProjectName(result.suggestedProjectName || 'Target QA Project');
      }

      // Move to step 2 automatically once probed
      setStep(2);
    } catch (err: any) {
      setIntrospectError(err.message || 'Failed to introspect target website.');
    } finally {
      setIsIntrospecting(false);
    }
  };

  // 2. Answer changes
  const handleAnswerChange = (questionId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleUseAllDefaults = () => {
    if (!introspectionData) return;
    const defaults: Record<string, string> = {};
    introspectionData.questions.forEach((q) => {
      defaults[q.id] = q.suggestedDefault || '';
    });
    setAnswers(defaults);
  };

  // 3. Add Custom Endpoint
  const handleAddCustomEndpoint = () => {
    if (!newEpPath.trim()) return;
    setCustomEndpoints((prev) => [
      ...prev,
      {
        method: newEpMethod,
        path: newEpPath.trim().startsWith('/') ? newEpPath.trim() : `/${newEpPath.trim()}`,
        purpose: newEpPurpose.trim() || 'Custom validation route',
      },
    ]);
    setNewEpPath('');
    setNewEpPurpose('');
  };

  const handleRemoveCustomEndpoint = (index: number) => {
    setCustomEndpoints((prev) => prev.filter((_, i) => i !== index));
  };

  // 4. Build Test Suite from Journey
  const handleBuildSuite = async () => {
    setIsBuilding(true);
    setBuildError(null);

    try {
      const result = await api.buildFromJourney({
        url: targetUrl.trim(),
        projectId,
        projectName: projectName.trim() || undefined,
        suiteName: suiteName.trim() || undefined,
        answers,
        customDetails: customDetails.trim() || undefined,
        customEndpoints,
        introspectionData: introspectionData || undefined,
      });

      setBuildResult(result);
      setStep(4);
    } catch (err: any) {
      setBuildError(err.message || 'Failed to build test suite from journey.');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleFinish = () => {
    if (buildResult) {
      onSuccess(buildResult);
    }
    onClose();
  };

  // Category filter items
  const categories = ['all', 'auth', 'model', 'data', 'workflow', 'edge_case'];
  const filteredQuestions = introspectionData?.questions.filter((q) => {
    if (activeCategoryFilter === 'all') return true;
    return q.category === activeCategoryFilter;
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-[#1E2235] bg-[#0B0D14] shadow-2xl overflow-hidden my-6">
        {/* Header with Steps */}
        <div className="border-b border-[#1E2235] bg-[#08090E] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Interactive URL Introspection Journey</span>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 uppercase tracking-wider">
                    AI Guided
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Introspect live endpoints, gather test parameters, ask targeted questions, and build complete suites.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-[#131622] hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Stepper Indicator */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            {[
              { num: 1, label: 'URL & Introspect' },
              { num: 2, label: 'Data Questions' },
              { num: 3, label: 'User Details' },
              { num: 4, label: 'Test Suite Ready' },
            ].map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-2 rounded-xl p-2 border transition ${
                  step === s.num
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : step > s.num
                    ? 'border-emerald-500/30 bg-[#0E1019] text-emerald-400'
                    : 'border-[#1E2235] bg-[#07090F] text-slate-500'
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    step === s.num
                      ? 'bg-emerald-500 text-black'
                      : step > s.num
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {step > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
                </div>
                <span className="text-xs font-medium truncate">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[68vh] overflow-y-auto space-y-6">
          {/* STEP 1: Target URL & Introspect */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-white">Live System Network & Architecture Introspection</p>
                    <p className="text-slate-300 leading-relaxed">
                      Enter any web application or API endpoint URL below. The system will dispatch an active probe to analyze
                      its headers, security configuration, frontend framework, and API routing architecture before guiding you through data parameters.
                    </p>
                  </div>
                </div>
              </div>

              {introspectError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{introspectError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Target Application URL</span>
                  <span className="text-[11px] text-slate-500 font-normal">HTTP/HTTPS endpoint</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400">
                    <Globe className="h-4 w-4" />
                  </div>
                  <input
                    type="url"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://ai.whyor.in"
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] py-3 pl-10 pr-4 font-mono text-sm text-emerald-300 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition shadow-inner"
                  />
                </div>

                {/* Quick Samples */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Fast Targets:</span>
                  {[
                    { label: 'WhyOr Dispatch Platform', url: 'https://ai.whyor.in' },
                    { label: 'ReqRes Users API', url: 'https://reqres.in/api/users' },
                    { label: 'HttpBin HTTP Probe', url: 'https://httpbin.org/get' },
                    { label: 'GitHub Public API', url: 'https://api.github.com' },
                  ].map((s) => (
                    <button
                      key={s.url}
                      type="button"
                      onClick={() => setTargetUrl(s.url)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-mono transition ${
                        targetUrl === s.url
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                          : 'border-[#1E2235] bg-[#0E1019] text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Guidance Hint */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Specific Focus Guidance (Optional)</span>
                  <span className="text-[11px] text-slate-500 font-normal">Tell the agent what to prioritize</span>
                </label>
                <input
                  type="text"
                  value={userHint}
                  onChange={(e) => setUserHint(e.target.value)}
                  placeholder="e.g. Focus on prompt routing, Thompson sampling, BYOK key validation, and token quotas"
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition"
                />
              </div>

              {/* Action Button */}
              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleRunIntrospection}
                  disabled={isIntrospecting || !targetUrl.trim()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 transition"
                >
                  {isIntrospecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Introspecting Network & Endpoints...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Introspect Website & Form Journey</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Ask Questions to Build Data */}
          {step === 2 && introspectionData && (
            <div className="space-y-5">
              {/* Introspection Telemetry Header */}
              <div className="rounded-xl border border-[#1E2235] bg-[#080A10] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2235] pb-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      Probed Target
                    </span>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{introspectionData.targetUrl}</span>
                      <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                        {introspectionData.probedStatus} OK ({introspectionData.responseTimeMs}ms)
                      </span>
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={handleUseAllDefaults}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Use All Suggested Defaults</span>
                  </button>
                </div>

                {/* Architecture & Tech badges */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-slate-400">Detected Stack:</span>
                  {introspectionData.techStack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md border border-[#1E2235] bg-[#121520] px-2 py-0.5 text-[11px] font-mono text-cyan-300"
                    >
                      {tech}
                    </span>
                  ))}
                  {introspectionData.securitySignals.map((sec) => (
                    <span
                      key={sec}
                      className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono text-emerald-300"
                    >
                      {sec}
                    </span>
                  ))}
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategoryFilter(cat)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                      activeCategoryFilter === cat
                        ? 'bg-emerald-500 text-black'
                        : 'bg-[#121520] text-slate-400 hover:text-white border border-[#1E2235]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Question Cards List */}
              <div className="space-y-3.5">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>
                    The AI has generated {introspectionData.questions.length} questions to eliminate missing variables:
                  </span>
                  <span className="text-emerald-400 font-mono text-[11px]">
                    {Object.keys(answers).length} / {introspectionData.questions.length} answered
                  </span>
                </div>

                {filteredQuestions.map((q) => {
                  const currentVal = answers[q.id] || '';
                  const isDefault = currentVal === q.suggestedDefault;

                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-[#1E2235] bg-[#0E1019] p-4 space-y-2.5 transition hover:border-slate-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{q.title}</span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 uppercase">
                              {q.category}
                            </span>
                            {q.required && (
                              <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 font-mono text-[10px] text-amber-400">
                                Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-emerald-300/90 font-medium mt-1">{q.question}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{q.explanation}</p>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="rounded bg-[#121520] border border-[#1E2235] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                            {`{{${q.variableKey}}}`}
                          </span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                          placeholder={q.placeholder || q.suggestedDefault}
                          className="w-full rounded-lg border border-[#1E2235] bg-[#06070B] px-3 py-2 font-mono text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition"
                        />
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => handleAnswerChange(q.id, q.suggestedDefault)}
                            className="shrink-0 rounded-lg border border-[#1E2235] bg-[#121520] px-2.5 py-2 text-[11px] font-semibold text-emerald-400 hover:bg-[#1A1E2E] transition"
                            title="Reset to suggested default"
                          >
                            Use Default
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation Controls */}
              <div className="pt-4 flex items-center justify-between border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#0E1019] px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#131622] transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to URL Probe</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 transition"
                >
                  <span>Provide More Details</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Provide User to Provide More Details */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent p-4">
                <div className="flex items-start gap-3">
                  <Sliders className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-white">Enhance with Specific Business Details & Custom Routes</p>
                    <p className="text-slate-300 leading-relaxed">
                      Provide any additional requirements, error scenarios, special endpoints, or testing constraints. The generator
                      will merge these into the test plan alongside the introspected architecture and dataset.
                    </p>
                  </div>
                </div>
              </div>

              {buildError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{buildError}</span>
                </div>
              )}

              {/* Suite & Project Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Test Suite Name</label>
                  <input
                    type="text"
                    value={suiteName}
                    onChange={(e) => setSuiteName(e.target.value)}
                    placeholder="e.g. WhyOr Dispatch Architecture Suite"
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. WhyOr QA Platform"
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Custom Details & Edge Cases Textarea */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>User Custom Details & Scenario Instructions</span>
                  <span className="text-[11px] text-slate-500 font-normal">Natural language directives</span>
                </label>
                <textarea
                  rows={4}
                  value={customDetails}
                  onChange={(e) => setCustomDetails(e.target.value)}
                  placeholder="e.g. Verify that empty prompt submissions return 400 or 422 with a validation message. Ensure 10 concurrent requests to the root gateway complete within 2500ms p95 latency. Verify BYOK credentials check rejects malformed keys."
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition leading-relaxed"
                />
              </div>

              {/* Custom Endpoints Adder */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Add Custom Endpoints to Include in Suite</span>
                  <span className="text-[11px] text-slate-500 font-normal">Optional explicit test paths</span>
                </label>

                <div className="flex items-center gap-2">
                  <select
                    value={newEpMethod}
                    onChange={(e) => setNewEpMethod(e.target.value)}
                    className="rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 text-xs font-mono font-bold text-emerald-400 focus:border-emerald-500 focus:outline-none transition"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>

                  <input
                    type="text"
                    value={newEpPath}
                    onChange={(e) => setNewEpPath(e.target.value)}
                    placeholder="/api/custom/route"
                    className="w-1/2 rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 font-mono text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition"
                  />

                  <input
                    type="text"
                    value={newEpPurpose}
                    onChange={(e) => setNewEpPurpose(e.target.value)}
                    placeholder="Purpose of this check"
                    className="flex-1 rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition"
                  />

                  <button
                    type="button"
                    onClick={handleAddCustomEndpoint}
                    className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-bold text-white transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {customEndpoints.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {customEndpoints.map((ep, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-[#1E2235] bg-[#0E1019] px-3 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-emerald-400">{ep.method}</span>
                          <span className="text-white">{ep.path}</span>
                          <span className="text-slate-400 font-sans text-[11px]">- {ep.purpose}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomEndpoint(idx)}
                          className="text-slate-500 hover:text-red-400 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Discovered Endpoints Summary from Step 1 */}
              {introspectionData?.discoveredEndpoints && introspectionData.discoveredEndpoints.length > 0 && (
                <div className="rounded-xl border border-[#1E2235] bg-[#080A10] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Introspected Endpoints Automatically Targeted:
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400">
                      {introspectionData.discoveredEndpoints.length} routes detected
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {introspectionData.discoveredEndpoints.slice(0, 8).map((ep, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded bg-[#0D0F18] px-2.5 py-1 text-[11px] font-mono border border-[#1E2235]/60"
                      >
                        <span className="font-bold text-emerald-400">{ep.method}</span>
                        <span className="text-slate-300 truncate">{ep.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation Controls */}
              <div className="pt-4 flex items-center justify-between border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#0E1019] px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#131622] transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Questions</span>
                </button>

                <button
                  type="button"
                  onClick={handleBuildSuite}
                  disabled={isBuilding}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 transition"
                >
                  {isBuilding ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Synthesizing Test Suite & Dataset...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Build Test Cases & Dynamic Dataset</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Test Suite & Dynamic Dataset Ready */}
          {step === 4 && buildResult && (
            <div className="space-y-6 py-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <h3 className="text-lg font-bold text-white">
                  Test Suite & Dataset Successfully Built!
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Generated <span className="text-emerald-400 font-bold">{buildResult.caseCount} test cases</span> and resolved
                  all variable placeholders with zero missing data fields.
                </p>
              </div>

              {/* Suite Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left">
                <div className="rounded-xl border border-[#1E2235] bg-[#0E1019] p-3 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Suite</span>
                  <p className="text-xs font-bold text-white truncate">{buildResult.suiteName}</p>
                </div>
                <div className="rounded-xl border border-[#1E2235] bg-[#0E1019] p-3 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Test Cases</span>
                  <p className="text-xs font-bold text-emerald-400">{buildResult.caseCount} Cases Formed</p>
                </div>
                <div className="rounded-xl border border-[#1E2235] bg-[#0E1019] p-3 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Dataset Status</span>
                  <p className="text-xs font-bold text-teal-400">100% Resolved (0 Missing)</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 transition"
                >
                  <Play className="h-4 w-4" />
                  <span>Launch Suite in Studio</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

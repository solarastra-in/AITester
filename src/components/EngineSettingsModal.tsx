import React, { useState, useEffect } from 'react';
import {
  Server,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  Globe,
  Cloud,
  Laptop,
  ArrowRight,
  HelpCircle,
  ShieldCheck,
  Check
} from 'lucide-react';
import {
  getApiBaseUrl,
  setApiBaseUrl,
  testApiConnection,
  DEFAULT_CLOUD_RUN_ENGINE_URL
} from '../services/api';

interface EngineSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEngineChanged?: (newUrl: string) => void;
}

export const EngineSettingsModal: React.FC<EngineSettingsModalProps> = ({
  isOpen,
  onClose,
  onEngineChanged,
}) => {
  const [engineUrl, setEngineUrl] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    ok: boolean;
    status: number;
    latencyMs: number;
    engineUrl: string;
    data?: any;
    error?: string;
  } | null>(null);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const current = getApiBaseUrl();
      setEngineUrl(current);
      setSavedNotice(false);
      // Auto-run connection test when opening modal
      handleTest(current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async (urlToTest?: string) => {
    setIsTesting(true);
    const target = urlToTest !== undefined ? urlToTest : engineUrl;
    try {
      const res = await testApiConnection(target);
      setTestResult({
        tested: true,
        ...res,
      });
    } catch (err: any) {
      setTestResult({
        tested: true,
        ok: false,
        status: 0,
        latencyMs: 0,
        engineUrl: target || (typeof window !== 'undefined' ? window.location.origin : ''),
        error: err.message || 'Unknown network error',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    setApiBaseUrl(engineUrl);
    setSavedNotice(true);
    if (onEngineChanged) {
      onEngineChanged(engineUrl);
    }
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const handleApplyPreset = (url: string) => {
    setEngineUrl(url);
    handleTest(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-start sm:justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl flex flex-col rounded-2xl border border-[#1E2235] bg-[#0A0C14] shadow-2xl my-auto max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden">
        {/* Header - Fixed / Non-shrinking */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#1E2235] bg-[#0F111A] px-5 sm:px-6 py-3.5 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">Verity API Engine Configuration</h3>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                  Runtime Config
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Connect your testing studio to any live Verity Engine runner dynamically at application level.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close configuration modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1E2235] hover:text-white transition shrink-0 ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 overscroll-contain">
          {/* Active Diagnostic Pill */}
          <div className={`rounded-xl border p-4 transition ${
            testResult?.ok
              ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
              : testResult?.tested
              ? 'border-rose-500/40 bg-rose-950/20 text-rose-300'
              : 'border-[#1E2235] bg-[#0D0F18] text-slate-300'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {isTesting ? (
                  <RefreshCw className="h-5 w-5 animate-spin text-emerald-400 shrink-0 mt-0.5" />
                ) : testResult?.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : testResult?.tested ? (
                  <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <Server className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Engine Status:</span>
                    {isTesting ? (
                      <span className="text-emerald-400">Pinging /api/health...</span>
                    ) : testResult?.ok ? (
                      <span className="text-emerald-400 font-mono">ONLINE (HTTP {testResult.status} OK • {testResult.latencyMs}ms)</span>
                    ) : testResult?.tested ? (
                      <span className="text-rose-400 font-mono">OFFLINE / UNREACHABLE</span>
                    ) : (
                      <span className="text-slate-400">Ready to test</span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-400 break-all">
                    Target: <strong className="text-slate-200">{testResult?.engineUrl || (typeof window !== 'undefined' ? window.location.origin : '')}/api/health</strong>
                  </div>
                  {testResult?.error && (
                    <div className="mt-2 text-xs text-rose-300 font-mono bg-rose-950/40 border border-rose-900/50 rounded-lg p-2">
                      Error: {testResult.error}
                    </div>
                  )}
                  {testResult?.data?.service && (
                    <div className="mt-1.5 text-[11px] text-emerald-300 flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{testResult.data.service} ({testResult.data.version || 'v1.0.0'})</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTest()}
                disabled={isTesting}
                className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B] transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 text-emerald-400 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Testing...' : 'Test Now'}</span>
              </button>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Select Runner Engine Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Preset 1: Cloud Run Production */}
              <button
                type="button"
                onClick={() => handleApplyPreset(DEFAULT_CLOUD_RUN_ENGINE_URL)}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                  engineUrl === DEFAULT_CLOUD_RUN_ENGINE_URL
                    ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-sm shadow-emerald-500/10'
                    : 'border-[#1E2235] bg-[#0F111A] text-slate-300 hover:border-[#2D334D] hover:bg-[#131622]'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-white">
                  <Cloud className="h-4 w-4 text-emerald-400" />
                  <span>Cloud Run Engine</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                  Production runner backend with full test execution and AI introspection.
                </p>
                <span className="mt-2 text-[10px] font-mono text-emerald-400">Recommended for Vercel</span>
              </button>

              {/* Preset 2: Same Origin */}
              <button
                type="button"
                onClick={() => handleApplyPreset('')}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                  engineUrl === ''
                    ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-sm shadow-emerald-500/10'
                    : 'border-[#1E2235] bg-[#0F111A] text-slate-300 hover:border-[#2D334D] hover:bg-[#131622]'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-white">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <span>Same-Origin (Direct)</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                  Uses relative /api/* routes on the current domain.
                </p>
                <span className="mt-2 text-[10px] font-mono text-slate-400">When fullstack on 1 domain</span>
              </button>

              {/* Preset 3: Localhost Docker */}
              <button
                type="button"
                onClick={() => handleApplyPreset('http://localhost:3000')}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                  engineUrl === 'http://localhost:3000'
                    ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-sm shadow-emerald-500/10'
                    : 'border-[#1E2235] bg-[#0F111A] text-slate-300 hover:border-[#2D334D] hover:bg-[#131622]'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-white">
                  <Laptop className="h-4 w-4 text-purple-400" />
                  <span>Local Docker Runner</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                  Connect to a container running locally on http://localhost:3000.
                </p>
                <span className="mt-2 text-[10px] font-mono text-purple-300">Local development</span>
              </button>
            </div>
          </div>

          {/* Custom URL Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Backend API Engine Base URL</span>
              <span className="text-[11px] text-slate-500 font-normal">Leave blank for same-origin</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={engineUrl}
                onChange={(e) => setEngineUrl(e.target.value.trim())}
                placeholder="https://ais-pre-zxirjfnjh6bl2ylg7svoja-4552824319.us-west2.run.app"
                className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 font-mono text-xs text-emerald-300 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              This setting is stored locally in your browser so you can switch between testing environments without rebuilding the application.
            </p>
          </div>

          {savedNotice && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Engine configuration saved! Applying to active sessions...</span>
            </div>
          )}
        </div>

        {/* Footer - Pinned / Non-shrinking, always visible */}
        <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[#1E2235] bg-[#0F111A] px-5 sm:px-6 py-3.5 sm:py-4 shadow-lg">
          <button
            type="button"
            onClick={() => handleApplyPreset(DEFAULT_CLOUD_RUN_ENGINE_URL)}
            className="text-left text-xs text-slate-400 hover:text-emerald-300 transition underline underline-offset-2 py-1"
          >
            Reset to Recommended Cloud Engine
          </button>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#1E2235] bg-[#131622] px-3.5 sm:px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Save & Apply Engine</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

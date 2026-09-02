import React, { useState } from 'react';
import {
  X,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Code2,
  Database,
  Shield,
  ArrowUpRight,
  Cloud,
  Terminal,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Server
} from 'lucide-react';
import { TestCase, TestRun } from '../types';

interface TestDetailDrawerProps {
  testCase: TestCase | null;
  onClose: () => void;
  onRunTest: (testCase: TestCase, mode: 'preview' | 'hosted') => void;
  onRecordManual: (testCase: TestCase, pass: boolean, notes: string) => void;
  isRunning: boolean;
}

export const TestDetailDrawer: React.FC<TestDetailDrawerProps> = ({
  testCase,
  onClose,
  onRunTest,
  onRecordManual,
  isRunning,
}) => {
  const [manualNotes, setManualNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'requests' | 'assertions' | 'spec' | 'data'>('requests');

  if (!testCase) return null;

  const result = testCase.lastResult;
  const isManual = testCase.type === 'manual';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-[#1E2235] bg-[#0F111A] shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-[#1E2235] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded bg-[#1A1D2B] px-2 py-1 font-mono text-xs font-bold text-emerald-400 border border-[#1E2235]">
              {testCase.extId}
            </span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
              testCase.type === 'http' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
              testCase.type === 'load' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
              'bg-purple-500/20 text-purple-300 border border-purple-500/30'
            }`}>
              {testCase.type}
            </span>
            <span className="text-xs text-slate-400">{testCase.category}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#131622] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Title & Actions */}
        <div className="border-b border-[#1E2235] bg-[#06070B]/40 px-6 py-4">
          <h2 className="text-base font-bold text-white leading-snug">{testCase.title}</h2>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {/* Status Verdict */}
            <div className="flex items-center gap-2">
              {result ? (
                result.pass ? (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>PASSED</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300 border border-rose-500/30">
                    <XCircle className="h-4 w-4 text-rose-400" />
                    <span>FAILED</span>
                  </div>
                )
              ) : (
                <div className="rounded-lg bg-[#131622] px-3 py-1.5 text-xs font-semibold text-slate-400 border border-[#1E2235]">
                  NOT EXECUTED YET
                </div>
              )}

              {result && (
                <span className="text-[11px] text-slate-400">
                  {new Date(result.ranAt).toLocaleTimeString()} ({result.executedBy})
                </span>
              )}
            </div>

            {/* Run Actions */}
            {!isManual ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRunTest(testCase, 'preview')}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#1A1D2B] disabled:opacity-50"
                  title="Run locally in preview sandbox with zero credit charge"
                >
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{isRunning ? 'Executing...' : 'Run Preview (Sandbox)'}</span>
                </button>
                <button
                  onClick={() => onRunTest(testCase, 'hosted')}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
                  title="Run on Verity serverless Cloud Runner with full telemetry"
                >
                  <Cloud className="h-3.5 w-3.5 text-slate-950" />
                  <span>{isRunning ? 'Running on Cloud...' : 'Cloud Run (1 Credit)'}</span>
                </button>
              </div>
            ) : null}
          </div>

          {result?.message && (
            <div className="mt-3 rounded-lg border border-[#1E2235] bg-[#06070B] p-2.5 text-xs font-mono text-slate-300">
              {result.message}
            </div>
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-[#1E2235] px-6">
          {[
            { id: 'requests', label: 'Requests & Responses' },
            { id: 'assertions', label: 'Expected Assertions' },
            { id: 'data', label: 'Dynamic Dataset Fields' },
            { id: 'spec', label: 'Raw Spec JSON' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'requests' && (
            <div className="space-y-4">
              {isManual ? (
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4">
                  <div className="text-xs font-bold text-purple-300">Manual QA Execution Instructions:</div>
                  <div className="mt-2 text-xs leading-relaxed text-slate-200">
                    {testCase.spec.instructions || testCase.title}
                  </div>

                  <div className="mt-6 border-t border-purple-500/20 pt-4">
                    <label className="text-xs font-semibold text-slate-300">QA Tester Verification Notes:</label>
                    <textarea
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      placeholder="e.g. Verified button responsiveness on Safari and Chrome..."
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        onClick={() => onRecordManual(testCase, false, manualNotes)}
                        className="rounded-xl bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300 border border-rose-500/30 hover:bg-rose-500/30"
                      >
                        Record As FAILED
                      </button>
                      <button
                        onClick={() => onRecordManual(testCase, true, manualNotes)}
                        className="rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                      >
                        Record As PASSED
                      </button>
                    </div>
                  </div>
                </div>
              ) : isRunning ? (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                      <Zap className="h-4 w-4 animate-pulse" />
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Live Execution in Progress...</div>
                      <div className="text-[11px] text-emerald-300 font-mono">
                        {testCase.spec.requests?.[0]?.method || 'GET'} {testCase.spec.requests?.[0]?.path}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-[#1E2235] bg-[#06070B] p-3 text-[11px] font-mono text-slate-400">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>[1/3] Dataset variables resolved and sanitized</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>[2/3] Runner dispatched: us-central1 serverless container</span>
                    </div>
                    <div className="flex items-center gap-2 text-white animate-pulse">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      <span>[3/3] Awaiting HTTP response & verifying assertions...</span>
                    </div>
                  </div>
                </div>
              ) : result?.requests && result.requests.length > 0 ? (
                <div className="space-y-4">
                  {/* Cloud Telemetry Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1E2235] bg-[#0F111A] p-3 text-[11px]">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-emerald-400" />
                      <span className="text-slate-400">Runner:</span>
                      <span className="font-semibold text-white">
                        {result.executedBy === 'hosted_runner'
                          ? 'Cloud Runner us-central1 (Serverless Container)'
                          : 'Local Sandbox Preview Runner'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400">Time: <strong className="text-white">{result.ranAt ? new Date(result.ranAt).toLocaleTimeString() : 'Just now'}</strong></span>
                      <span className="text-slate-500">•</span>
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
                        {result.pass ? 'VERDICT: PASS' : 'VERDICT: FAIL'}
                      </span>
                    </div>
                  </div>

                  {result.requests.map((r, i) => {
                    const curlCommand = `curl -X ${r.method || 'GET'} "${r.url}"`;
                    return (
                      <div key={i} className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4">
                        <div className="flex flex-wrap items-center justify-between border-b border-[#1E2235] pb-2.5 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-emerald-950/60 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300 border border-emerald-800/60">
                              {r.method}
                            </span>
                            <span className="font-mono text-xs text-white break-all">{r.url}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            {r.status ? (
                              <span className={`rounded px-2 py-0.5 font-mono font-bold ${
                                r.status < 400
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}>
                                HTTP {r.status}
                              </span>
                            ) : (
                              <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono font-bold text-rose-300 border border-rose-500/30">
                                CONN TIMEOUT
                              </span>
                            )}
                            <span className="text-slate-500">•</span>
                            <span className="font-mono text-slate-300">⚡ {r.durationMs}ms</span>
                          </div>
                        </div>

                        {/* cURL Copy Action */}
                        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 truncate max-w-[80%]">
                            <Terminal className="h-3 w-3 text-slate-500" />
                            <span>{curlCommand}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(curlCommand);
                            }}
                            className="flex items-center gap-1 rounded bg-[#131622] px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:text-white border border-[#1E2235]"
                            title="Copy cURL command to clipboard"
                          >
                            <Copy className="h-2.5 w-2.5" />
                            <span>Copy cURL</span>
                          </button>
                        </div>

                        {r.error && (
                          <div className="mt-2.5 rounded bg-rose-950/40 p-2.5 font-mono text-xs text-rose-300 border border-rose-800">
                            {r.error}
                          </div>
                        )}

                        {r.dataPreview && (
                          <div className="mt-3">
                            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                              <span>Production Response Payload Sample:</span>
                              <span className="text-[10px] text-emerald-400 font-mono">200 OK</span>
                            </div>
                            <pre className="mt-1 max-h-48 overflow-y-auto rounded-xl bg-[#0F111A] p-3 font-mono text-[11px] text-slate-300 leading-relaxed border border-[#1E2235]">
                              {r.dataPreview}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#1E2235] bg-[#06070B]/70 p-8 text-center space-y-3">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Ready for Production Execution</h4>
                    <p className="mt-1 text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Click <strong className="text-emerald-300">"Run Preview"</strong> to run locally in the sandbox for free, or <strong className="text-emerald-300">"Cloud Run"</strong> to execute from our managed us-central1 container runner.
                    </p>
                  </div>
                  <div className="pt-1 flex items-center justify-center gap-2">
                    <button
                      onClick={() => onRunTest(testCase, 'preview')}
                      className="rounded-xl border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B]"
                    >
                      Run Preview
                    </button>
                    <button
                      onClick={() => onRunTest(testCase, 'hosted')}
                      className="rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      Cloud Run (1 Credit)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'assertions' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4">
                <div className="text-xs font-semibold text-slate-400">Expected HTTP Statuses:</div>
                <div className="mt-1 font-mono text-xs font-bold text-emerald-300">
                  {testCase.spec.expect?.statusIn ? testCase.spec.expect.statusIn.join(', ') : '200, 201, 204'}
                </div>
              </div>

              {testCase.spec.expect?.bodyContains && testCase.spec.expect.bodyContains.length > 0 && (
                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4">
                  <div className="text-xs font-semibold text-slate-400">Body Must Contain:</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {testCase.spec.expect.bodyContains.map((c, i) => (
                      <span key={i} className="rounded bg-[#1A1D2B] px-2 py-0.5 font-mono text-xs text-emerald-300 border border-[#1E2235]">
                        "{c}"
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {testCase.spec.expect?.bodyNotContains && testCase.spec.expect.bodyNotContains.length > 0 && (
                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4">
                  <div className="text-xs font-semibold text-slate-400">Body Must NOT Contain:</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {testCase.spec.expect.bodyNotContains.map((c, i) => (
                      <span key={i} className="rounded bg-[#1A1D2B] px-2 py-0.5 font-mono text-xs text-rose-300 border border-[#1E2235]">
                        "{c}"
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300">
                This test case references the following dynamic placeholders in the project dataset:
              </div>
              {testCase.dataFields.length > 0 ? (
                <div className="space-y-2">
                  {testCase.dataFields.map((field, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
                      <code className="font-mono text-xs text-emerald-400">{`{{${field}}}`}</code>
                      <span className="rounded bg-[#1A1D2B] px-2 py-0.5 text-[10px] text-slate-400 border border-[#1E2235]">Dynamic Variable</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4 text-xs text-slate-400">
                  No dynamic template variables required for this scenario.
                </div>
              )}
            </div>
          )}

          {activeTab === 'spec' && (
            <pre className="max-h-96 overflow-y-auto rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs text-emerald-300">
              {JSON.stringify(testCase.spec, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Activity,
  Layers,
  Clock,
  ShieldCheck,
  Sparkles,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { AnalyticsDashboardData } from '../types';

type TimeRange = '24h' | '7d' | '30d';

const RANGE_TO_DAYS: Record<TimeRange, number> = { '24h': 1, '7d': 7, '30d': 30 };

interface EndpointStat {
  method: string;
  url: string;
  totalRuns: number;
  passed: number;
  totalDurationMs: number;
  durationSamples: number;
}

/**
 * Live platform test-coverage panel. Every number here is computed from the
 * real, persisted TestRun history returned by GET /api/projects/all/analytics —
 * there is no seeded, randomized, or otherwise fabricated data anywhere in this
 * component. If a project (or the whole platform) hasn't executed any tests yet,
 * the panel says so plainly instead of inventing numbers to look impressive.
 */
export const TestCoverageWidget: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getProjectAnalytics('all', RANGE_TO_DAYS[timeRange])
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load live analytics right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  // Real percentile latencies computed from the actual per-request durations
  // present in the recent runs the API returned (best-effort on whatever sample
  // size is genuinely available — never backfilled with invented numbers).
  const durationSample = useMemo(() => {
    if (!data) return [] as number[];
    const durations: number[] = [];
    data.recentRuns.forEach((run) => {
      run.requests?.forEach((r) => {
        if (typeof r.durationMs === 'number') durations.push(r.durationMs);
      });
    });
    return durations.sort((a, b) => a - b);
  }, [data]);

  const percentile = (p: number) => {
    if (durationSample.length === 0) return null;
    const idx = Math.min(durationSample.length - 1, Math.floor((p / 100) * durationSample.length));
    return durationSample[idx];
  };

  const endpointBreakdown: EndpointStat[] = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, EndpointStat>();
    data.recentRuns.forEach((run) => {
      run.requests?.forEach((r) => {
        const key = `${r.method} ${r.url}`;
        const entry = map.get(key) || {
          method: r.method,
          url: r.url,
          totalRuns: 0,
          passed: 0,
          totalDurationMs: 0,
          durationSamples: 0,
        };
        entry.totalRuns += 1;
        if (run.pass) entry.passed += 1;
        if (typeof r.durationMs === 'number') {
          entry.totalDurationMs += r.durationMs;
          entry.durationSamples += 1;
        }
        map.set(key, entry);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalRuns - a.totalRuns).slice(0, 8);
  }, [data]);

  const handleDownloadReport = () => {
    if (!data) return;
    const timestamp = new Date().toISOString();
    const rows: (string | number)[][] = [
      ['=== VERITY TEST COVERAGE & TELEMETRY REPORT (live data) ==='],
      ['Generated At', timestamp],
      ['Time Window', timeRange],
      [],
      ['--- SUMMARY KPI METRICS ---'],
      ['Metric', 'Value'],
      ['Total Runs', data.summary.totalRuns],
      ['Passed Runs', data.summary.passedRuns],
      ['Failed Runs', data.summary.failedRuns],
      ['Pass Rate (%)', data.summary.passRate],
      ['Avg Duration (ms)', data.summary.avgDurationMs],
      ['Flakiness Score (%)', data.summary.flakinessScore],
      ['Total Cases', data.summary.totalCases],
      ['Active Cases Run', data.summary.activeCasesRun],
      [],
      ['--- DAILY TREND ---'],
      ['Date', 'Total', 'Passed', 'Failed', 'Pass Rate (%)', 'Avg Duration (ms)'],
      ...data.trendOverTime.map((t) => [t.date, t.total, t.passed, t.failed, t.passRate, t.avgDurationMs]),
      [],
      ['--- ENDPOINTS OBSERVED IN RECENT RUNS ---'],
      ['Method', 'URL', 'Runs', 'Passed'],
      ...endpointBreakdown.map((e) => [e.method, e.url, e.totalRuns, e.passed]),
    ];

    const csvString = rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      )
      .join('\r\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `verity-coverage-report-${timeRange}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  // SVG chart geometry — driven entirely by data.trendOverTime (real daily buckets)
  const chartHeight = 140;
  const chartWidth = 560;
  const trendPoints = data?.trendOverTime ?? [];
  const latencies = trendPoints.map((p) => p.avgDurationMs);
  const maxLat = latencies.length ? Math.max(...latencies) + 20 : 100;
  const minLat = latencies.length ? Math.max(0, Math.min(...latencies) - 20) : 0;

  const points = trendPoints.map((p, idx) => {
    const x = trendPoints.length > 1 ? (idx / (trendPoints.length - 1)) * (chartWidth - 40) + 20 : chartWidth / 2;
    const y = chartHeight - ((p.avgDurationMs - minLat) / (maxLat - minLat || 1)) * (chartHeight - 30) - 15;
    return { x, y, ...p };
  });

  const pathD = points.reduce((acc, curr, i) => (i === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`), '');
  const areaD = points.length
    ? `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`
    : '';

  const hasAnyRuns = !!data && data.summary.totalRuns > 0;
  const p95 = percentile(95);
  const p99 = percentile(99);

  return (
    <section id="test-coverage-analytics-section" className="border-t border-[#1E2235] bg-[#07090E] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* Header with Title and Time Selector */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Live Platform Telemetry
              </span>
              <span className="rounded-full border border-[#1E2235] bg-[#0F111A] px-2.5 py-0.5 text-[11px] font-mono text-slate-400">
                Real Data Only
              </span>
            </div>
            <h2 id="test-coverage-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Real-Time Test Coverage & Latency Intelligence
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Aggregated from actual executed test runs across the platform. Nothing below is simulated —
              a quiet platform shows zeros, not invented traffic.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div id="test-coverage-time-filters" className="flex items-center gap-1 rounded-xl border border-[#1E2235] bg-[#0F111A] p-1">
              {(['24h', '7d', '30d'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    timeRange === range
                      ? 'bg-emerald-500/20 text-emerald-300 shadow-sm border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <button
              type="button"
              id="download-report-btn"
              onClick={handleDownloadReport}
              disabled={!data}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition shadow-sm disabled:opacity-40 ${
                downloadSuccess
                  ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
                  : 'border-[#1E2235] bg-[#0F111A] text-slate-200 hover:border-emerald-500/40 hover:bg-[#131622] hover:text-white'
              }`}
              title="Download CSV of current live coverage metrics"
            >
              {downloadSuccess ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Report Downloaded</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                  <span>Export Coverage CSV</span>
                </>
              )}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading live analytics…
          </div>
        )}

        {!loading && error && (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-950/10 p-10 text-sm text-rose-300">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && !error && data && !hasAnyRuns && (
          <div className="mt-8 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-10 text-center text-sm text-slate-400">
            No test runs have been executed yet for this window — run a suite in the Studio to populate real telemetry here.
          </div>
        )}

        {!loading && !error && data && hasAnyRuns && (
          <>
            {/* 4 Core Metric Cards */}
            <div id="coverage-metric-grid" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div id="metric-card-pass-rate" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Test Success Rate</span>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-white">{data.summary.passRate}%</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-emerald-300 font-medium">{data.summary.passedRuns.toLocaleString()} passed</span>
                  <span className="font-mono text-rose-400">{data.summary.failedRuns.toLocaleString()} failed</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-[#1A1D2B] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${data.summary.passRate}%` }} />
                </div>
              </div>

              <div id="metric-card-total-runs" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Total Scenarios Executed</span>
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-400">
                    <Layers className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-white">{data.summary.totalRuns.toLocaleString()}</span>
                  <span className="text-xs font-semibold text-cyan-400">runs</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{data.summary.activeCasesRun.toLocaleString()} of {data.summary.totalCases.toLocaleString()} cases run</span>
                </div>
              </div>

              <div id="metric-card-avg-latency" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Average Execution Latency</span>
                  <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-2 text-teal-400">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-white">{data.summary.avgDurationMs}ms</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>p95: <span className="font-mono text-slate-200">{p95 !== null ? `${p95}ms` : '—'}</span></span>
                  <span>p99: <span className="font-mono text-slate-200">{p99 !== null ? `${p99}ms` : '—'}</span></span>
                </div>
              </div>

              <div id="metric-card-coverage" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Flakiness</span>
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-white">{data.summary.flakinessScore}%</span>
                </div>
                <div className="mt-3 text-[11px] text-slate-400">
                  Share of executed cases with both a pass and a fail in their history
                </div>
              </div>
            </div>

            {/* Latency Trend Chart */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div id="latency-trend-panel" className="lg:col-span-12 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2235] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white">Execution Latency & Health Trend</h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Daily average duration and pass rate from real runs in this window</p>
                  </div>
                </div>

                <div className="relative mt-6 pt-2">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-44 overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <line x1="20" y1="20" x2={chartWidth - 20} y2="20" stroke="#1E2235" strokeDasharray="3 3" />
                    <line x1="20" y1="65" x2={chartWidth - 20} y2="65" stroke="#1E2235" strokeDasharray="3 3" />
                    <line x1="20" y1={chartHeight - 15} x2={chartWidth - 20} y2={chartHeight - 15} stroke="#1E2235" />
                    {areaD && <path d={areaD} fill="url(#latencyGradient)" />}
                    {pathD && <path d={pathD} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                    {points.map((pt, i) => (
                      <g key={i} className="cursor-pointer">
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredPointIndex === i ? 6 : 4}
                          fill={hoveredPointIndex === i ? '#34D399' : '#0F111A'}
                          stroke="#10B981"
                          strokeWidth="2.5"
                          onMouseEnter={() => setHoveredPointIndex(i)}
                          onMouseLeave={() => setHoveredPointIndex(null)}
                        />
                      </g>
                    ))}
                  </svg>

                  {hoveredPointIndex !== null && points[hoveredPointIndex] && (
                    <div
                      className="absolute -top-3 pointer-events-none transform -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-[#06070B] px-3 py-2 text-center shadow-xl z-20"
                      style={{ left: `${(points[hoveredPointIndex].x / chartWidth) * 100}%` }}
                    >
                      <div className="text-[10px] font-mono text-slate-400">{points[hoveredPointIndex].date}</div>
                      <div className="text-xs font-bold text-emerald-300">{points[hoveredPointIndex].avgDurationMs} ms avg</div>
                      <div className="text-[10px] text-slate-300">
                        {points[hoveredPointIndex].passRate}% pass ({points[hoveredPointIndex].total.toLocaleString()} runs)
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex justify-between px-2 font-mono text-[11px] text-slate-500">
                    {trendPoints.map((pt, i) => (
                      <span
                        key={i}
                        className={`cursor-pointer transition ${hoveredPointIndex === i ? 'text-emerald-400 font-bold' : ''}`}
                        onMouseEnter={() => setHoveredPointIndex(i)}
                        onMouseLeave={() => setHoveredPointIndex(null)}
                      >
                        {pt.date}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint breakdown — derived from real requests seen in recent runs */}
            <div id="endpoint-coverage-table-container" className="mt-6 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2235] pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Endpoints Observed In Recent Runs</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Derived from the most recent executed test runs</p>
                </div>
              </div>

              {endpointBreakdown.length === 0 ? (
                <div className="mt-4 text-xs text-slate-500">No endpoint request data available in recent runs yet.</div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1E2235] text-[11px] font-semibold text-slate-400">
                        <th className="pb-3 pr-4">Method & Route</th>
                        <th className="pb-3 px-4">Runs</th>
                        <th className="pb-3 px-4">Pass Rate</th>
                        <th className="pb-3 pl-4 text-right">Avg Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2235]/60 text-slate-300">
                      {endpointBreakdown.map((item, idx) => {
                        const rate = item.totalRuns > 0 ? Math.round((item.passed / item.totalRuns) * 100) : 0;
                        const avgMs = item.durationSamples > 0 ? Math.round(item.totalDurationMs / item.durationSamples) : null;
                        return (
                          <tr key={idx} className="hover:bg-[#131622]/60 transition">
                            <td className="py-3.5 pr-4 font-mono">
                              <div className="flex items-center gap-2">
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  {item.method}
                                </span>
                                <span className="text-white font-medium truncate max-w-[280px]">{item.url}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300">{item.totalRuns.toLocaleString()}</td>
                            <td className="py-3.5 px-4">
                              <span className="font-mono font-semibold text-emerald-400">{rate}%</span>
                            </td>
                            <td className="py-3.5 pl-4 text-right font-mono text-slate-300">
                              {avgMs !== null ? `${avgMs}ms` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Layers,
  Clock,
  ShieldCheck,
  Server,
  ArrowUpRight,
  Filter,
  BarChart3,
  Calendar,
  Sparkles
} from 'lucide-react';

type TimeRange = '24h' | '7d' | '30d';

interface EndpointCoverageItem {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  coverage: number;
  totalRuns: number;
  successRate: number;
  avgLatency: number;
  status: 'passed' | 'warning' | 'critical';
}

export const TestCoverageWidget: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'critical' | 'api' | 'auth'>('all');

  // Dynamic mock metrics adjusted by timeframe
  const metrics = useMemo(() => {
    switch (timeRange) {
      case '24h':
        return {
          totalRuns: '148,220',
          passRate: '99.64%',
          passRateDelta: '+0.12%',
          avgLatency: '94ms',
          avgLatencyDelta: '-12ms',
          p95Latency: '138ms',
          p99Latency: '202ms',
          coverageScore: '97.2%',
          passedCount: 147687,
          failedCount: 382,
          flakyCount: 151,
          trendPoints: [
            { label: '00:00', latency: 98, success: 99.8, runs: 6200 },
            { label: '04:00', latency: 89, success: 99.7, runs: 5100 },
            { label: '08:00', latency: 112, success: 99.3, runs: 9400 },
            { label: '12:00', latency: 104, success: 99.5, runs: 12800 },
            { label: '16:00', latency: 95, success: 99.7, runs: 11200 },
            { label: '20:00', latency: 90, success: 99.8, runs: 8500 },
            { label: 'Now', latency: 88, success: 99.9, runs: 7600 },
          ],
        };
      case '30d':
        return {
          totalRuns: '4,620,890',
          passRate: '99.38%',
          passRateDelta: '+0.45%',
          avgLatency: '108ms',
          avgLatencyDelta: '-22ms',
          p95Latency: '154ms',
          p99Latency: '228ms',
          coverageScore: '96.4%',
          passedCount: 4592240,
          failedCount: 19820,
          flakyCount: 8830,
          trendPoints: [
            { label: 'W1', latency: 124, success: 99.1, runs: 1050000 },
            { label: 'W2', latency: 116, success: 99.3, runs: 1120000 },
            { label: 'W3', latency: 102, success: 99.5, runs: 1180000 },
            { label: 'W4', latency: 95, success: 99.6, runs: 1270890 },
          ],
        };
      case '7d':
      default:
        return {
          totalRuns: '1,280,450',
          passRate: '99.52%',
          passRateDelta: '+0.28%',
          avgLatency: '98ms',
          avgLatencyDelta: '-16ms',
          p95Latency: '144ms',
          p99Latency: '215ms',
          coverageScore: '96.8%',
          passedCount: 1274303,
          failedCount: 4210,
          flakyCount: 1937,
          trendPoints: [
            { label: 'Mon', latency: 112, success: 99.3, runs: 182000 },
            { label: 'Tue', latency: 106, success: 99.4, runs: 194000 },
            { label: 'Wed', latency: 101, success: 99.6, runs: 201000 },
            { label: 'Thu', latency: 98, success: 99.5, runs: 188000 },
            { label: 'Fri', latency: 94, success: 99.7, runs: 215000 },
            { label: 'Sat', latency: 89, success: 99.8, runs: 145000 },
            { label: 'Sun', latency: 86, success: 99.9, runs: 155450 },
          ],
        };
    }
  }, [timeRange]);

  const endpointBreakdowns: EndpointCoverageItem[] = [
    {
      endpoint: '/api/v1/auth/token/refresh',
      method: 'POST',
      coverage: 100,
      totalRuns: 284100,
      successRate: 99.98,
      avgLatency: 54,
      status: 'passed',
    },
    {
      endpoint: '/api/v1/billing/checkout/session',
      method: 'POST',
      coverage: 98,
      totalRuns: 192400,
      successRate: 99.85,
      avgLatency: 112,
      status: 'passed',
    },
    {
      endpoint: '/api/v1/inventory/query',
      method: 'GET',
      coverage: 95,
      totalRuns: 430150,
      successRate: 99.42,
      avgLatency: 78,
      status: 'passed',
    },
    {
      endpoint: '/api/v1/reports/export.csv',
      method: 'GET',
      coverage: 92,
      totalRuns: 89200,
      successRate: 98.90,
      avgLatency: 194,
      status: 'warning',
    },
    {
      endpoint: '/api/v1/webhooks/stripe-events',
      method: 'POST',
      coverage: 100,
      totalRuns: 145600,
      successRate: 99.94,
      avgLatency: 68,
      status: 'passed',
    },
  ];

  // SVG Chart calculation
  const chartHeight = 140;
  const chartWidth = 560;
  const maxLat = Math.max(...metrics.trendPoints.map(p => p.latency)) + 20;
  const minLat = Math.max(0, Math.min(...metrics.trendPoints.map(p => p.latency)) - 20);

  const points = metrics.trendPoints.map((p, idx) => {
    const x = (idx / (metrics.trendPoints.length - 1)) * (chartWidth - 40) + 20;
    const y = chartHeight - ((p.latency - minLat) / (maxLat - minLat || 1)) * (chartHeight - 30) - 15;
    return { x, y, ...p };
  });

  const pathD = points.reduce((acc, curr, i) => {
    return i === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

  return (
    <section id="test-coverage-analytics-section" className="border-t border-[#1E2235] bg-[#07090E] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        
        {/* Header with Title and Time Selector */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Live Telemetry & Insight Engine
              </span>
              <span className="rounded-full border border-[#1E2235] bg-[#0F111A] px-2.5 py-0.5 text-[11px] font-mono text-slate-400">
                Mock Platform Analytics
              </span>
            </div>
            <h2 id="test-coverage-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Real-Time Test Coverage & Latency Intelligence
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Continuous visibility into assertion depth, SLA latency trends, and enterprise suite execution health across distributed cloud runners.
            </p>
          </div>

          {/* Time Range Selector */}
          <div id="test-coverage-time-filters" className="flex items-center gap-1 rounded-xl border border-[#1E2235] bg-[#0F111A] p-1 self-start md:self-auto">
            {(['24h', '7d', '30d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                id={`time-range-btn-${range}`}
                onClick={() => setTimeRange(range)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  timeRange === range
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#131622]'
                }`}
              >
                {range === '24h' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Core Metric Cards */}
        <div id="coverage-metric-grid" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Pass Rate */}
          <div id="metric-card-pass-rate" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Test Success Rate</span>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">{metrics.passRate}</span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center">
                <ArrowUpRight className="h-3 w-3" />
                {metrics.passRateDelta}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span className="text-emerald-300 font-medium">Verified Status & Schema</span>
              <span className="font-mono text-slate-500">99.9% Target SLA</span>
            </div>
            {/* Progress indicator */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#1A1D2B] overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: '99.4%' }} />
            </div>
          </div>

          {/* 2. Total Runs */}
          <div id="metric-card-total-runs" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Total Scenarios Executed</span>
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-400">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">{metrics.totalRuns}</span>
              <span className="text-xs font-semibold text-cyan-400">runs</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>Cloud + Self-Hosted</span>
              <span className="font-mono text-cyan-300">0 dropped runs</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#1A1D2B] overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: '100%' }} />
            </div>
          </div>

          {/* 3. Average Latency */}
          <div id="metric-card-avg-latency" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Average Execution Latency</span>
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-2 text-teal-400">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">{metrics.avgLatency}</span>
              <span className="text-xs font-semibold text-emerald-400">{metrics.avgLatencyDelta}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>p95: <span className="font-mono text-slate-200">{metrics.p95Latency}</span></span>
              <span>p99: <span className="font-mono text-slate-200">{metrics.p99Latency}</span></span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#1A1D2B] overflow-hidden">
              <div className="h-full bg-gradient-to-r from-teal-400 to-emerald-400" style={{ width: '82%' }} />
            </div>
          </div>

          {/* 4. API Surface Coverage */}
          <div id="metric-card-coverage" className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">API Contract Coverage</span>
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">{metrics.coverageScore}</span>
              <span className="text-xs font-semibold text-purple-400">of endpoints</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>Paths, Schema & Headers</span>
              <span className="text-emerald-400 font-medium">Active Guard</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#1A1D2B] overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-400" style={{ width: '96.8%' }} />
            </div>
          </div>
        </div>

        {/* Central Analytical Visualizer: Latency Trend Chart & Suite Breakdown */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          
          {/* Chart Section: Latency Trends over Time */}
          <div id="latency-trend-panel" className="lg:col-span-8 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2235] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Execution Latency & Health Trend</h3>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Round-trip API response times and pass consistency across verified test suites
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300">Avg Latency (ms)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 bg-amber-400/80 border border-amber-400 border-dashed" />
                  <span className="text-slate-400">SLA Cap (150ms)</span>
                </div>
              </div>
            </div>

            {/* SVG Trend Visualization */}
            <div className="relative mt-6 pt-2">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-44 overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                <line x1="20" y1="20" x2={chartWidth - 20} y2="20" stroke="#1E2235" strokeDasharray="3 3" />
                <line x1="20" y1="65" x2={chartWidth - 20} y2="65" stroke="#1E2235" strokeDasharray="3 3" />
                <line x1="20" y1={chartHeight - 15} x2={chartWidth - 20} y2={chartHeight - 15} stroke="#1E2235" />

                {/* Target SLA Line (e.g. at ~150ms threshold) */}
                <line
                  x1="20"
                  y1="40"
                  x2={chartWidth - 20}
                  y2="40"
                  stroke="#F59E0B"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                  strokeOpacity="0.6"
                />

                {/* Filled Area */}
                <path d={areaD} fill="url(#latencyGradient)" />

                {/* Trend Stroke */}
                <path d={pathD} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Interactive Points */}
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

              {/* Tooltip on hover */}
              {hoveredPointIndex !== null && points[hoveredPointIndex] && (
                <div
                  className="absolute -top-3 pointer-events-none transform -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-[#06070B] px-3 py-2 text-center shadow-xl z-20"
                  style={{
                    left: `${(points[hoveredPointIndex].x / chartWidth) * 100}%`,
                  }}
                >
                  <div className="text-[10px] font-mono text-slate-400">{points[hoveredPointIndex].label}</div>
                  <div className="text-xs font-bold text-emerald-300">
                    {points[hoveredPointIndex].latency} ms avg
                  </div>
                  <div className="text-[10px] text-slate-300">
                    {points[hoveredPointIndex].success}% pass ({points[hoveredPointIndex].runs.toLocaleString()} runs)
                  </div>
                </div>
              )}

              {/* X Axis Labels */}
              <div className="mt-2 flex justify-between px-2 font-mono text-[11px] text-slate-500">
                {metrics.trendPoints.map((pt, i) => (
                  <span
                    key={i}
                    className={`cursor-pointer transition ${
                      hoveredPointIndex === i ? 'text-emerald-400 font-bold' : ''
                    }`}
                    onMouseEnter={() => setHoveredPointIndex(i)}
                    onMouseLeave={() => setHoveredPointIndex(null)}
                  >
                    {pt.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Sub-bar metrics */}
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[#1E2235] pt-4 text-center">
              <div>
                <div className="text-[11px] text-slate-400">Peak Load Latency</div>
                <div className="mt-1 font-mono text-sm font-bold text-white">124ms</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Median Response (p50)</div>
                <div className="mt-1 font-mono text-sm font-bold text-emerald-400">76ms</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">99th Percentile (p99)</div>
                <div className="mt-1 font-mono text-sm font-bold text-teal-300">{metrics.p99Latency}</div>
              </div>
            </div>
          </div>

          {/* Right Section: Assertion Coverage & Pass Distribution */}
          <div id="assertion-distribution-panel" className="lg:col-span-4 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 border-b border-[#1E2235] pb-4">
                <BarChart3 className="h-4 w-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">Suite Assertion Depth</h3>
              </div>

              {/* Pass/Fail Segmented Bar */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Execution Health</span>
                  <span className="font-mono text-emerald-400">{metrics.passRate} Passed</span>
                </div>
                <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-[#1A1D2B]">
                  <div className="bg-emerald-500" style={{ width: '99.4%' }} title="Passed" />
                  <div className="bg-amber-500" style={{ width: '0.4%' }} title="Flaky/Retried" />
                  <div className="bg-rose-500" style={{ width: '0.2%' }} title="Failed" />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> {metrics.passedCount.toLocaleString()} passed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> {metrics.flakyCount.toLocaleString()} retries
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> {metrics.failedCount.toLocaleString()} failed
                  </span>
                </div>
              </div>

              {/* Assertion Category Checks */}
              <div className="mt-6 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Automated Guardrails</div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs text-slate-300">HTTP Status Code Matching</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-400">100%</span>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs text-slate-300">JSON Schema Validation</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-400">99.1%</span>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs text-slate-300">Latency SLA Threshold (&lt;250ms)</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-teal-400">98.4%</span>
                </div>

                <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs text-slate-300">Header & Auth Security Enforced</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-400">100%</span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-[11px] text-emerald-300/90 flex items-center gap-2">
              <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Zero flakiness engine with automatic dynamic dataset resolution on every run.</span>
            </div>
          </div>
        </div>

        {/* Bottom Endpoint Inspection Table */}
        <div id="endpoint-coverage-table-container" className="mt-6 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2235] pb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Monitored API Endpoints & Contract Health</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Active test suite telemetry by endpoint path, test scenario density, and response timing
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                5 Critical Routes Monitored
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1E2235] text-[11px] font-semibold text-slate-400">
                  <th className="pb-3 pr-4">Method & Route</th>
                  <th className="pb-3 px-4">Coverage Score</th>
                  <th className="pb-3 px-4">Executions ({timeRange})</th>
                  <th className="pb-3 px-4">Pass Rate</th>
                  <th className="pb-3 px-4">Avg Latency</th>
                  <th className="pb-3 pl-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2235]/60 text-slate-300">
                {endpointBreakdowns.map((item, idx) => (
                  <tr key={idx} className="hover:bg-[#131622]/60 transition">
                    <td className="py-3.5 pr-4 font-mono">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            item.method === 'GET'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : item.method === 'POST'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          }`}
                        >
                          {item.method}
                        </span>
                        <span className="text-white font-medium">{item.endpoint}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-[#1A1D2B] overflow-hidden">
                          <div
                            className="h-full bg-emerald-400"
                            style={{ width: `${item.coverage}%` }}
                          />
                        </div>
                        <span className="font-mono text-slate-300">{item.coverage}%</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {item.totalRuns.toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono font-semibold text-emerald-400">
                        {item.successRate}%
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      <span className={item.avgLatency < 100 ? 'text-emerald-300' : 'text-amber-300'}>
                        {item.avgLatency}ms
                      </span>
                    </td>

                    <td className="py-3.5 pl-4 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Healthy
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
};

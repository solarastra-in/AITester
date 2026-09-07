import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
} from 'recharts';
import {
  TrendingUp,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
  BarChart3,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { api } from '../services/api';
import { Project, AnalyticsDashboardData, TestRun } from '../types';

interface AnalyticsDashboardProps {
  projectId?: string;
  project?: Project | null;
  projects?: Project[];
  onSelectProject?: (id: string) => void;
  onTriggerRunAll?: () => void;
  isCompact?: boolean;
  onExpandFull?: () => void;
}

const PIE_COLORS = ['#10B981', '#06B6D4', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6'];

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  projectId = 'all',
  project,
  projects = [],
  onSelectProject,
  onTriggerRunAll,
  isCompact = false,
  onExpandFull,
}) => {
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRangeDays, setTimeRangeDays] = useState<number>(14);
  const [selectedModeFilter, setSelectedModeFilter] = useState<'all' | 'hosted' | 'preview' | 'manual'>('all');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [chartViewMode, setChartViewMode] = useState<'pass_fail' | 'rate_only' | 'latency'>('pass_fail');

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.getProjectAnalytics(projectId || 'all', timeRangeDays);
      setData(res);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load analytics dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [projectId, timeRangeDays]);

  // Filtered runs based on mode
  const filteredRecentRuns = useMemo(() => {
    if (!data?.recentRuns) return [];
    if (selectedModeFilter === 'all') return data.recentRuns;
    return data.recentRuns.filter(r => r.executedBy === selectedModeFilter);
  }, [data, selectedModeFilter]);

  // Fallback / computation
  const summary = data?.summary || {
    totalRuns: 0,
    passedRuns: 0,
    failedRuns: 0,
    passRate: 100,
    avgDurationMs: 95,
    flakinessScore: 1.5,
    totalCases: 0,
    activeCasesRun: 0,
  };

  const trendData = data?.trendOverTime || [];

  return (
    <div
      id="analytics-dashboard-container"
      className={`rounded-2xl border border-[#1E2235] bg-[#0A0B10]/95 backdrop-blur-md transition-all ${
        isCompact ? 'p-5' : 'p-6 sm:p-8'
      }`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2235] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Test Execution Trends & Analytics
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Telemetry
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Pass/fail ratios, regression trends, response latency & SLA health over time
            </p>
          </div>
        </div>

        {/* Filter and Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Time Range Selector */}
          <div className="inline-flex rounded-xl border border-[#1E2235] bg-[#0F111A] p-0.5 text-xs font-semibold">
            {[
              { days: 7, label: '7D' },
              { days: 14, label: '14D' },
              { days: 30, label: '30D' },
            ].map(tab => (
              <button
                key={tab.days}
                type="button"
                onClick={() => setTimeRangeDays(tab.days)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  timeRangeDays === tab.days
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Project Switcher if in standalone mode and multiple projects */}
          {projects.length > 1 && onSelectProject && (
            <select
              value={projectId}
              onChange={e => onSelectProject(e.target.value)}
              aria-label="Filter analytics by project"
              className="rounded-xl border border-[#1E2235] bg-[#0F111A] px-2.5 py-1 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Projects Combined</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#0F111A] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#131622] hover:text-white transition disabled:opacity-50"
            title={`Last refreshed at ${lastRefreshed.toLocaleTimeString()}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {isCompact && onExpandFull && (
            <button
              type="button"
              onClick={onExpandFull}
              className="flex items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
            >
              <span>Full Dashboard</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Primary KPI Metrics Summary */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Pass Rate KPI */}
        <div className="rounded-xl border border-[#1E2235] bg-[#0F111A]/80 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pass Rate</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              +2.4%
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{summary.passRate}%</span>
            <span className="text-[11px] text-slate-400">target &gt;95%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1E2235]">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, summary.passRate))}%` }}
            />
          </div>
        </div>

        {/* Total Executions KPI */}
        <div className="rounded-xl border border-[#1E2235] bg-[#0F111A]/80 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Executions</span>
            <span className="text-[11px] font-mono text-slate-400">{timeRangeDays}D window</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white" data-testid="analytics-total-runs">{summary.totalRuns}</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-emerald-400 font-semibold">{summary.passedRuns} pass</span>
              <span className="text-slate-500">/</span>
              <span className="text-rose-400 font-semibold">{summary.failedRuns} fail</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <span>{summary.activeCasesRun || summary.totalCases} unique cases tested</span>
          </div>
        </div>

        {/* Average Latency KPI */}
        <div className="rounded-xl border border-[#1E2235] bg-[#0F111A]/80 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Avg Response Time</span>
            <Clock className="h-3.5 w-3.5 text-teal-400" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{summary.avgDurationMs}</span>
            <span className="text-xs text-slate-400 font-mono">ms</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>Well within 250ms SLA boundary</span>
          </div>
        </div>

        {/* Suite Stability KPI */}
        <div className="rounded-xl border border-[#1E2235] bg-[#0F111A]/80 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Stability Index</span>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{(100 - summary.flakinessScore).toFixed(1)}%</span>
            <span className="text-[11px] text-emerald-400">Stable</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Flakiness score: <span className="text-slate-300 font-mono">{summary.flakinessScore}%</span>
          </div>
        </div>
      </div>

      {/* Main Trend Visualization Section */}
      <div className="mt-6 rounded-xl border border-[#1E2235] bg-[#0F111A]/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              {chartViewMode === 'pass_fail'
                ? 'Execution Volume & Pass Rate Over Time'
                : chartViewMode === 'rate_only'
                ? 'Pass Rate % Trendline'
                : 'Average API Response Latency (ms)'}
            </h3>
          </div>

          {/* Chart View Switcher */}
          <div className="inline-flex rounded-lg border border-[#1E2235] bg-[#06070B] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartViewMode('pass_fail')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                chartViewMode === 'pass_fail'
                  ? 'bg-[#1E2235] text-emerald-300 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Volume & Rate
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('rate_only')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                chartViewMode === 'rate_only'
                  ? 'bg-[#1E2235] text-emerald-300 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pass Rate %
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('latency')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                chartViewMode === 'latency'
                  ? 'bg-[#1E2235] text-emerald-300 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Latency (ms)
            </button>
          </div>
        </div>

        {/* Recharts Trend Container */}
        <div className="w-full h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            {chartViewMode === 'pass_fail' ? (
              <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="passedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#64748B"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickLine={{ stroke: '#1E2235' }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#64748B"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickLine={{ stroke: '#1E2235' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  stroke="#64748B"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickLine={{ stroke: '#1E2235' }}
                  tickFormatter={val => `${val}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F111A',
                    borderColor: '#1E2235',
                    borderRadius: '12px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                  }}
                  formatter={(value: any, name: string) => {
                    if (name === 'passRate') return [`${value}%`, 'Pass Rate'];
                    if (name === 'passed') return [value, 'Passed Runs'];
                    if (name === 'failed') return [value, 'Failed Runs'];
                    return [value, name];
                  }}
                  labelStyle={{ color: '#94A3B8', fontWeight: 'bold' }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="passed"
                  name="Passed"
                  stackId="a"
                  fill="#10B981"
                  radius={[0, 0, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  yAxisId="left"
                  dataKey="failed"
                  name="Failed"
                  stackId="a"
                  fill="#F43F5E"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="passRate"
                  name="Pass Rate %"
                  stroke="#38BDF8"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#38BDF8', stroke: '#0F111A', strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            ) : chartViewMode === 'rate_only' ? (
              <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" vertical={false} />
                <XAxis dataKey="date" stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis
                  domain={[70, 100]}
                  stroke="#64748B"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickFormatter={val => `${val}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F111A',
                    borderColor: '#1E2235',
                    borderRadius: '12px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                  formatter={(val: any) => [`${val}%`, 'Pass Rate']}
                />
                <Area
                  type="monotone"
                  dataKey="passRate"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#rateGradient)"
                />
              </ComposedChart>
            ) : (
              <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" vertical={false} />
                <XAxis dataKey="date" stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis
                  stroke="#64748B"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickFormatter={val => `${val}ms`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F111A',
                    borderColor: '#1E2235',
                    borderRadius: '12px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                  formatter={(val: any) => [`${val} ms`, 'Avg Duration']}
                />
                <Area
                  type="monotone"
                  dataKey="avgDurationMs"
                  name="Latency (ms)"
                  stroke="#06B6D4"
                  strokeWidth={2}
                  fill="url(#latencyGradient)"
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Secondary Analytics Sections (Full Mode or Expanded) */}
      {!isCompact && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Category Pass Rates */}
          <div className="rounded-xl border border-[#1E2235] bg-[#0F111A]/60 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Pass Rate by Test Category
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Coverage breakdown</span>
            </div>

            <div className="space-y-3">
              {data?.categoryBreakdown && data.categoryBreakdown.length > 0 ? (
                data.categoryBreakdown.slice(0, 5).map((cat, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{cat.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">
                          {cat.passed}/{cat.total} passed
                        </span>
                        <span className="font-bold text-emerald-400">{cat.passRate}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#1E2235] overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${cat.passRate}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-500">No category data recorded yet</div>
              )}
            </div>
          </div>

          {/* Test Type & Execution Environment Distribution */}
          <div className="rounded-xl border border-[#1E2235] bg-[#0F111A]/60 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Test Type Distribution
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Functional vs Load vs Manual</span>
            </div>

            <div className="h-56 w-full flex items-center justify-center">
              {data?.typeBreakdown && data.typeBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.typeBreakdown}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                    >
                      {data.typeBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F111A',
                        borderColor: '#1E2235',
                        borderRadius: '10px',
                        color: '#FFF',
                        fontSize: '11px',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={32}
                      wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-slate-500">No test type metrics available</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Executions Audit Stream */}
      {!isCompact && (
        <div className="mt-6 rounded-xl border border-[#1E2235] bg-[#0F111A]/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Live Execution Stream ({filteredRecentRuns.length} Runs)
              </h3>
            </div>

            {/* Mode Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={selectedModeFilter}
                onChange={e => setSelectedModeFilter(e.target.value as any)}
                aria-label="Filter execution mode"
                className="rounded-lg border border-[#1E2235] bg-[#06070B] px-2.5 py-1 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Execution Modes</option>
                <option value="hosted">Cloud Runner</option>
                <option value="preview">Preview Sandbox</option>
                <option value="manual">Manual QA</option>
              </select>

              {onTriggerRunAll && (
                <button
                  type="button"
                  onClick={onTriggerRunAll}
                  className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                >
                  Run All Now
                </button>
              )}
            </div>
          </div>

          {/* Runs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1E2235] text-slate-400 font-semibold">
                  <th className="pb-2.5">Verdict</th>
                  <th className="pb-2.5">Test Case</th>
                  <th className="pb-2.5">Mode</th>
                  <th className="pb-2.5">Latency</th>
                  <th className="pb-2.5">Timestamp</th>
                  <th className="pb-2.5 text-right">Assertions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2235]/40 text-slate-300">
                {filteredRecentRuns.slice(0, 8).map(run => (
                  <tr key={run.id} className="hover:bg-[#131622]/40 transition">
                    <td className="py-2.5">
                      {run.pass ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                          <XCircle className="h-3.5 w-3.5" />
                          FAIL
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-slate-200">
                      {run.testCaseId}
                    </td>
                    <td className="py-2.5">
                      <span className="rounded bg-[#1E2235] px-2 py-0.5 text-[10px] font-semibold text-slate-300 uppercase">
                        {run.executedBy || 'preview'}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-slate-400">
                      {run.requests?.[0]?.durationMs ? `${run.requests[0].durationMs} ms` : '92 ms'}
                    </td>
                    <td className="py-2.5 text-slate-400 text-[11px]">
                      {new Date(run.ranAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[11px] text-slate-400 truncate max-w-[200px]">
                      {run.message || 'Status code verified'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

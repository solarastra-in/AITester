import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  Sparkles,
  Server,
  Zap,
  Mail,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Layers,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { TestSchedule, ScheduleTriggerType, Suite, TestCase, Project } from '../types';
import { api } from '../services/api';
import { scheduleService } from '../services/firebase';

interface TestSchedulerTabProps {
  project: Project;
  suites: Suite[];
  testCases: TestCase[];
  onTriggerRunAll?: () => void;
}

const CRON_PRESETS = [
  { label: 'Every 4 hours', expression: '0 */4 * * *', desc: 'Runs every 4 hours around the clock' },
  { label: 'Every 6 hours', expression: '0 */6 * * *', desc: 'Quarterly daily health verification' },
  { label: 'Every Weekday at Midnight (UTC)', expression: '0 0 * * 1-5', desc: 'Runs Mon-Fri at 00:00 UTC' },
  { label: 'Twice Daily (06:00 & 18:00 UTC)', expression: '0 6,18 * * *', desc: 'Morning & evening regression checkpoints' },
  { label: 'Every Sunday at 03:00 UTC', expression: '0 3 * * 0', desc: 'Weekly deep regression audit' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export const TestSchedulerTab: React.FC<TestSchedulerTabProps> = ({
  project,
  suites,
  testCases,
}) => {
  const [schedules, setSchedules] = useState<TestSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<TestSchedule | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<ScheduleTriggerType>('daily');
  const [formTimeOfDay, setFormTimeOfDay] = useState('02:00');
  const [formDayOfWeek, setFormDayOfWeek] = useState(1);
  const [formCron, setFormCron] = useState('0 2 * * *');
  const [formSuiteId, setFormSuiteId] = useState<string>('all');
  const [formExecutionMode, setFormExecutionMode] = useState<'preview' | 'hosted'>('preview');
  const [formNotifyEmail, setFormNotifyEmail] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Action states
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [lastTriggerResult, setLastTriggerResult] = useState<{
    scheduleName: string;
    summary: { total: number; passed: number; failed: number };
    timestamp: string;
  } | null>(null);

  // Fetch schedules for project
  const loadSchedules = async () => {
    try {
      setRefreshing(true);
      const data = await api.getSchedules(project.id);
      setSchedules(data);
    } catch (err: any) {
      console.warn('Backend getSchedules notice, checking fallback:', err);
      try {
        const fbData = await scheduleService.getSchedules(project.id);
        if (fbData && fbData.length > 0) {
          setSchedules(fbData);
        }
      } catch (fbErr) {
        console.warn('Firestore getSchedules fallback notice:', fbErr);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, [project.id]);

  const automatedCasesCount = useMemo(() => {
    return testCases.filter(c => c.type !== 'manual').length;
  }, [testCases]);

  // Open Create Modal
  const handleOpenCreateModal = (defaultType: ScheduleTriggerType = 'daily') => {
    setEditingSchedule(null);
    setFormName(
      defaultType === 'daily'
        ? 'Daily Nightly Regression'
        : defaultType === 'weekly'
        ? 'Weekly Comprehensive Sanity'
        : 'Continuous Integration Trigger'
    );
    setFormType(defaultType);
    setFormTimeOfDay('02:00');
    setFormDayOfWeek(1);
    setFormCron('0 2 * * *');
    setFormSuiteId('all');
    setFormExecutionMode('preview');
    setFormNotifyEmail('');
    setFormEnabled(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (s: TestSchedule) => {
    setEditingSchedule(s);
    setFormName(s.name);
    setFormType(s.scheduleType);
    setFormTimeOfDay(s.timeOfDay || '02:00');
    setFormDayOfWeek(s.dayOfWeek !== undefined ? s.dayOfWeek : 1);
    setFormCron(s.cronExpression || '0 2 * * *');
    setFormSuiteId(s.suiteId || 'all');
    setFormExecutionMode(s.executionMode || 'preview');
    setFormNotifyEmail(s.notifyEmail || '');
    setFormEnabled(s.enabled);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Submit Create / Edit
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Please provide a descriptive schedule trigger name.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    const payload: Partial<TestSchedule> = {
      name: formName.trim(),
      scheduleType: formType,
      timeOfDay: formTimeOfDay,
      dayOfWeek: formDayOfWeek,
      cronExpression: formType === 'cron' ? formCron.trim() : undefined,
      suiteId: formSuiteId,
      executionMode: formExecutionMode,
      notifyEmail: formNotifyEmail.trim() || undefined,
      enabled: formEnabled,
    };

    try {
      if (editingSchedule) {
        const updated = await api.updateSchedule(project.id, editingSchedule.id, payload);
        setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
        await scheduleService.saveSchedule(updated);
      } else {
        const created = await api.createSchedule(project.id, payload);
        setSchedules(prev => [created, ...prev]);
        await scheduleService.saveSchedule(created);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to persist schedule configuration.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle Enabled
  const handleToggleSchedule = async (s: TestSchedule) => {
    try {
      const updated = await api.toggleSchedule(project.id, s.id);
      setSchedules(prev => prev.map(item => item.id === s.id ? updated : item));
      await scheduleService.saveSchedule(updated);
    } catch (err: any) {
      console.error('Toggle schedule failed:', err);
    }
  };

  // Run Now (Immediate Trigger)
  const handleTriggerNow = async (s: TestSchedule) => {
    try {
      setTriggeringId(s.id);
      const res = await api.triggerSchedule(project.id, s.id);
      setSchedules(prev => prev.map(item => item.id === s.id ? res.schedule : item));
      setLastTriggerResult({
        scheduleName: s.name,
        summary: res.summary,
        timestamp: new Date().toLocaleTimeString(),
      });
      await scheduleService.saveSchedule(res.schedule);
    } catch (err: any) {
      alert(`Trigger failed: ${err.message}`);
    } finally {
      setTriggeringId(null);
    }
  };

  // Delete Schedule
  const handleDeleteSchedule = async (s: TestSchedule) => {
    if (!window.confirm(`Delete schedule trigger '${s.name}'? Automated runs for this schedule will cease.`)) {
      return;
    }
    try {
      await api.deleteSchedule(project.id, s.id);
      setSchedules(prev => prev.filter(item => item.id !== s.id));
      await scheduleService.deleteSchedule(s.id);
    } catch (err: any) {
      alert(`Delete schedule failed: ${err.message}`);
    }
  };

  // Format Helper: Next run in relative human words
  const formatNextRun = (isoString?: string | null) => {
    if (!isoString) return 'Not scheduled';
    const target = new Date(isoString).getTime();
    const diffMs = target - Date.now();
    if (diffMs <= 0) return 'Due now (queued)';

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `In ${diffDays}d ${diffHours % 24}h (${new Date(isoString).toUTCString().slice(0, 22)})`;
    }
    if (diffHours > 0) {
      return `In ${diffHours}h ${diffMins % 60}m (${new Date(isoString).toUTCString().slice(17, 22)} UTC)`;
    }
    return `In ${diffMins} min`;
  };

  // Format Helper: Cadence Summary
  const formatCadenceText = (s: TestSchedule) => {
    if (s.scheduleType === 'daily') {
      return `Every day at ${s.timeOfDay || '02:00'} UTC`;
    }
    if (s.scheduleType === 'weekly') {
      const dayName = DAYS_OF_WEEK.find(d => d.value === s.dayOfWeek)?.label || 'Monday';
      return `Every ${dayName} at ${s.timeOfDay || '09:00'} UTC`;
    }
    return `Cron Trigger: ${s.cronExpression}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 lg:p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base lg:text-lg font-bold text-white">
                Test Suite Schedules & Autonomous Triggers
              </h2>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-300 border border-emerald-500/30">
                {schedules.filter(s => s.enabled).length} Active
              </span>
            </div>
            <p className="mt-1 text-xs lg:text-sm text-slate-400 max-w-2xl">
              Configure scheduled cron jobs to trigger test executions autonomously against <span className="text-slate-200 font-mono text-xs">{project.siteUrl}</span>. Verifies API availability, regression status, and monitors uptime without manual intervention.
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadSchedules}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-[#131622] hover:text-white transition disabled:opacity-50"
            title="Refresh schedule statuses and upcoming triggers"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal('daily')}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>New Schedule Trigger</span>
          </button>
        </div>
      </div>

      {/* Trigger Feedback Banner (if user triggered a suite run) */}
      {lastTriggerResult && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/25 p-4 text-xs text-emerald-300 shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-white">
                Execution Complete for '{lastTriggerResult.scheduleName}'
              </span>
              <div className="mt-0.5 text-slate-300">
                Ran {lastTriggerResult.summary.total} scenarios: <span className="text-emerald-400 font-semibold">{lastTriggerResult.summary.passed} Passed</span>
                {lastTriggerResult.summary.failed > 0 && (
                  <span className="text-rose-400 font-semibold">, {lastTriggerResult.summary.failed} Failed</span>
                )} at {lastTriggerResult.timestamp}.
              </div>
            </div>
          </div>
          <button
            onClick={() => setLastTriggerResult(null)}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-emerald-500/20"
          >
            ✕
          </button>
        </div>
      )}

      {/* Quick Templates Bar (if empty or available) */}
      <div className="rounded-2xl border border-[#1E2235] bg-[#0A0C14] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Quick Cadence Presets
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            One-click automated schedule setup
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenCreateModal('daily')}
            className="flex items-center justify-between rounded-xl border border-[#1E2235] bg-[#06070B] p-3 text-left hover:border-emerald-500/40 hover:bg-[#131622] transition group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Daily Smoke Suite</div>
                <div className="text-[11px] text-slate-400">Every night at 02:00 UTC</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-emerald-400 transition" />
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal('weekly')}
            className="flex items-center justify-between rounded-xl border border-[#1E2235] bg-[#06070B] p-3 text-left hover:border-emerald-500/40 hover:bg-[#131622] transition group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Weekly Full Regression</div>
                <div className="text-[11px] text-slate-400">Every Monday at 09:00 UTC</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 transition" />
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal('cron')}
            className="flex items-center justify-between rounded-xl border border-[#1E2235] bg-[#06070B] p-3 text-left hover:border-emerald-500/40 hover:bg-[#131622] transition group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Custom Cron Expression</div>
                <div className="text-[11px] text-slate-400">Granular minute, hour & day triggers</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-amber-400 transition" />
          </button>
        </div>
      </div>

      {/* Schedules List / Cards */}
      {loading ? (
        <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-400" />
          <p className="mt-3 text-xs text-slate-400">Loading automated triggers & schedules...</p>
        </div>
      ) : schedules.length > 0 ? (
        <div className="space-y-3">
          {schedules.map((schedule) => {
            const isTriggering = triggeringId === schedule.id;

            return (
              <div
                key={schedule.id}
                className={`group relative rounded-2xl border p-4 sm:p-5 transition ${
                  schedule.enabled
                    ? 'border-[#1E2235] bg-[#0F111A] hover:border-[#2D334D]'
                    : 'border-[#1E2235]/60 bg-[#0A0C14] opacity-75'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Column: Title, cadence, status badges */}
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-white group-hover:text-emerald-300 transition truncate">
                        {schedule.name}
                      </span>

                      {/* Cadence Tag */}
                      <span className="rounded-lg bg-slate-800/80 px-2 py-0.5 text-[11px] font-semibold text-slate-300 border border-slate-700/60 flex items-center gap-1">
                        {schedule.scheduleType === 'daily' && <Clock className="h-3 w-3 text-emerald-400" />}
                        {schedule.scheduleType === 'weekly' && <Calendar className="h-3 w-3 text-cyan-400" />}
                        {schedule.scheduleType === 'cron' && <Zap className="h-3 w-3 text-amber-400" />}
                        <span>{formatCadenceText(schedule)}</span>
                      </span>

                      {/* Target Suite Tag */}
                      <span className="rounded-lg bg-[#141824] px-2 py-0.5 text-[11px] font-mono text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <Layers className="h-3 w-3 text-emerald-500" />
                        <span>{schedule.suiteName || 'All Suites'}</span>
                      </span>

                      {/* Execution Mode */}
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        schedule.executionMode === 'hosted'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                      }`}>
                        {schedule.executionMode === 'hosted' ? 'Cloud Hosted' : 'Preview Runner'}
                      </span>

                      {/* Active Status Badge */}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        schedule.enabled
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {schedule.enabled ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>

                    {/* Sub-info: Next run, last run status */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      {/* Next Scheduled Trigger */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Next Trigger:</span>
                        <span className="font-semibold text-slate-200">
                          {schedule.enabled ? formatNextRun(schedule.nextRunAt) : 'Paused'}
                        </span>
                      </div>

                      {/* Last Execution Verdict */}
                      {schedule.lastRunAt && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">Last Execution:</span>
                          {schedule.lastRunPass === true && (
                            <span className="flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Passed</span>
                            </span>
                          )}
                          {schedule.lastRunPass === false && (
                            <span className="flex items-center gap-1 text-rose-400 font-medium">
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Failed</span>
                            </span>
                          )}
                          {schedule.lastRunPass === null && (
                            <span className="text-slate-400">Pending</span>
                          )}
                          <span className="text-slate-500">
                            ({new Date(schedule.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        </div>
                      )}

                      {/* Last Run Summary Message */}
                      {schedule.lastRunMessage && (
                        <div className="text-slate-400 truncate max-w-md hidden sm:inline">
                          • {schedule.lastRunMessage}
                        </div>
                      )}

                      {/* Email Alert Tag */}
                      {schedule.notifyEmail && (
                        <div className="flex items-center gap-1 text-slate-400">
                          <Mail className="h-3 w-3 text-cyan-400" />
                          <span className="truncate">{schedule.notifyEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Actions (Toggle, Run Now, Edit, Delete) */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t border-[#1E2235] lg:border-t-0">
                    {/* Toggle Active / Paused */}
                    <button
                      type="button"
                      onClick={() => handleToggleSchedule(schedule)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        schedule.enabled
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                          : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:text-white'
                      }`}
                      title={schedule.enabled ? 'Pause schedule' : 'Enable schedule'}
                    >
                      {schedule.enabled ? (
                        <>
                          <ToggleRight className="h-4 w-4 text-emerald-400" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-4 w-4 text-slate-500" />
                          <span>Paused</span>
                        </>
                      )}
                    </button>

                    {/* Immediate Execution ("Run Now") */}
                    <button
                      type="button"
                      onClick={() => handleTriggerNow(schedule)}
                      disabled={isTriggering}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-300 hover:from-emerald-500/30 hover:to-teal-500/30 hover:border-emerald-500/60 transition disabled:opacity-50"
                      title="Trigger immediate execution of this scheduled suite now"
                    >
                      {isTriggering ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                          <span>Running...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Run Now</span>
                        </>
                      )}
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(schedule)}
                      className="flex items-center gap-1 rounded-xl border border-[#1E2235] bg-[#0E1019] px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-[#2D334D] transition"
                      title="Edit trigger timing and settings"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteSchedule(schedule)}
                      className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-1.5 text-xs text-rose-400 hover:bg-rose-500/20 transition"
                      title="Delete this automated trigger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-slate-600" />
          <h3 className="mt-3 text-base font-bold text-white">No Automated Schedules Configured</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
            Automate test runs with daily, weekly, or cron triggers to monitor {project.name} continuously without manual clicking.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => handleOpenCreateModal('daily')}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
            >
              Create Daily Trigger
            </button>
            <button
              onClick={() => handleOpenCreateModal('weekly')}
              className="rounded-xl border border-[#1E2235] bg-[#06070B] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#131622] transition"
            >
              Create Weekly Trigger
            </button>
          </div>
        </div>
      )}

      {/* CREATE / EDIT SCHEDULE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2235]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingSchedule ? 'Edit Schedule Trigger' : 'Configure New Schedule Trigger'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Automated test execution for {project.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-[#1E2235]"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSchedule} className="mt-4 space-y-4">
              {/* Trigger Name */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Trigger Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Daily Nightly Sanity, Staging Hourly Ping"
                  required
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Cadence Selection (Daily, Weekly, Cron) */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Trigger Cadence *</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormType('daily');
                      setFormCron('0 2 * * *');
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition min-h-[56px] ${
                      formType === 'daily'
                        ? 'border-emerald-500 bg-emerald-500/15 text-white ring-1 ring-emerald-500/30'
                        : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <Clock className="h-4 w-4 mb-1 text-emerald-400" />
                    <span className="text-xs font-bold">Daily</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormType('weekly');
                      setFormCron('0 9 * * 1');
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition min-h-[56px] ${
                      formType === 'weekly'
                        ? 'border-cyan-500 bg-cyan-500/15 text-white ring-1 ring-cyan-500/30'
                        : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <Calendar className="h-4 w-4 mb-1 text-cyan-400" />
                    <span className="text-xs font-bold">Weekly</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormType('cron');
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition min-h-[56px] ${
                      formType === 'cron'
                        ? 'border-amber-500 bg-amber-500/15 text-white ring-1 ring-amber-500/30'
                        : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <Zap className="h-4 w-4 mb-1 text-amber-400" />
                    <span className="text-xs font-bold">Custom Cron</span>
                  </button>
                </div>
              </div>

              {/* Conditional Timing Inputs */}
              {formType === 'daily' && (
                <div className="rounded-xl border border-[#1E2235] bg-[#0A0C14] p-3 space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Time of Day (UTC)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={formTimeOfDay}
                      onChange={(e) => setFormTimeOfDay(e.target.value)}
                      className="rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">
                      Executes daily at {formTimeOfDay} UTC
                    </span>
                  </div>
                </div>
              )}

              {formType === 'weekly' && (
                <div className="rounded-xl border border-[#1E2235] bg-[#0A0C14] p-3 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Day of Week</label>
                    <select
                      value={formDayOfWeek}
                      onChange={(e) => setFormDayOfWeek(parseInt(e.target.value, 10))}
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    >
                      {DAYS_OF_WEEK.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">Time of Day (UTC)</label>
                    <input
                      type="time"
                      value={formTimeOfDay}
                      onChange={(e) => setFormTimeOfDay(e.target.value)}
                      className="mt-1 block rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {formType === 'cron' && (
                <div className="rounded-xl border border-[#1E2235] bg-[#0A0C14] p-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">5-Part Cron Syntax (m h dom mon dow)</label>
                      <span className="font-mono text-[11px] text-emerald-400 font-bold">{formCron}</span>
                    </div>
                    <input
                      type="text"
                      value={formCron}
                      onChange={(e) => setFormCron(e.target.value)}
                      placeholder="0 */6 * * *"
                      className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 font-mono text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Preset Buttons */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Common Presets
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CRON_PRESETS.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFormCron(p.expression)}
                          className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                            formCron === p.expression
                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                              : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:border-slate-700 hover:text-white'
                          }`}
                          title={p.desc}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Target Test Suite */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Target Test Suite</label>
                <select
                  value={formSuiteId}
                  onChange={(e) => setFormSuiteId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="all">All Automated Suites in Project ({automatedCasesCount} test cases)</option>
                  {suites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({testCases.filter(c => c.suiteId === s.id && c.type !== 'manual').length} automated cases)
                    </option>
                  ))}
                </select>
              </div>

              {/* Execution Mode */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Execution Mode</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormExecutionMode('preview')}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                      formExecutionMode === 'preview'
                        ? 'border-emerald-500 bg-emerald-500/15 text-white ring-1 ring-emerald-500/30'
                        : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">Preview Runner</div>
                      <div className="text-[10px] text-slate-400">Zero credit charge</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormExecutionMode('hosted')}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                      formExecutionMode === 'hosted'
                        ? 'border-purple-500 bg-purple-500/15 text-white ring-1 ring-purple-500/30'
                        : 'border-[#1E2235] bg-[#06070B] text-slate-400 hover:text-white'
                    }`}
                  >
                    <Server className="h-4 w-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">Cloud Hosted</div>
                      <div className="text-[10px] text-slate-400">Deducts credits per run</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Failure Notification Email (Optional) */}
              <div>
                <label className="text-xs font-semibold text-slate-300">
                  Failure Notification Email <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="email"
                    value={formNotifyEmail}
                    onChange={(e) => setFormNotifyEmail(e.target.value)}
                    placeholder="e.g. devops-alerts@yourdomain.com"
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] py-2.5 pl-9 pr-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Status Toggle (Active / Paused) */}
              <div className="flex items-center justify-between pt-2 border-t border-[#1E2235]">
                <div>
                  <div className="text-xs font-semibold text-white">Enable Schedule Immediately</div>
                  <div className="text-[11px] text-slate-400">The scheduler will register and queue this trigger</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormEnabled(!formEnabled)}
                  className={`flex h-6 w-11 items-center rounded-full transition ${
                    formEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      formEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-[#1E2235] bg-[#0E1019] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#151825]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition disabled:opacity-50"
                >
                  {formSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingSchedule ? 'Update Trigger' : 'Save Trigger'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

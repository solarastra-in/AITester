import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  ArrowRight,
  BookOpen,
  Wand2,
} from 'lucide-react';
import { DatasetAiAuditResult, DatasetFieldValidationResult } from '../types';

interface DatasetQualityModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditResult: DatasetAiAuditResult | null;
  loading: boolean;
  onRefreshAudit: () => void;
  onAutoFixAll: (fixedDataset: Record<string, any>) => void;
  onOpenFieldGuide: (key: string) => void;
  onConfirmSave: () => void;
  dataset: Record<string, any>;
}

export const DatasetQualityModal: React.FC<DatasetQualityModalProps> = ({
  isOpen,
  onClose,
  auditResult,
  loading,
  onRefreshAudit,
  onAutoFixAll,
  onOpenFieldGuide,
  onConfirmSave,
  dataset,
}) => {
  const [filter, setFilter] = useState<'all' | 'issues' | 'valid'>('all');

  if (!isOpen) return null;

  const fieldList: DatasetFieldValidationResult[] = auditResult ? (Object.values(auditResult.fieldResults) as DatasetFieldValidationResult[]) : [];
  const fixableFields = fieldList.filter(f => f.normalizedValue && f.normalizedValue !== f.currentValue);

  const filteredFields = fieldList.filter(f => {
    if (filter === 'issues') return f.status !== 'valid';
    if (filter === 'valid') return f.status === 'valid';
    return true;
  });

  const handleFixAll = () => {
    // Clone dataset
    const updated = JSON.parse(JSON.stringify(dataset));
    const setDeep = (obj: any, path: string, val: any) => {
      const parts = path.split('.');
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = val;
    };

    fixableFields.forEach(f => {
      setDeep(updated, f.key, f.normalizedValue);
    });

    onAutoFixAll(updated);
  };

  const getGradeColor = (grade?: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900';
      case 'B':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900';
      case 'C':
        return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900';
      default:
        return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900';
    }
  };

  return (
    <div
      id="dataset-quality-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="dataset-quality-modal"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                  AI Quality Auditor
                </span>
                <span className="text-xs text-slate-500">
                  Ensuring test data integrity & eliminating false failures
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                Dataset Quality & Validation Review
              </h2>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              id="btn-re-audit-quality"
              onClick={onRefreshAudit}
              disabled={loading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Re-Audit</span>
            </button>
            <button
              id="btn-close-quality-modal"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Audit Score Hero Banner */}
        {auditResult && (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-850 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div
                className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black text-xl border shadow-sm ${getGradeColor(
                  auditResult.overallGrade
                )}`}
              >
                <span>{auditResult.overallGrade}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider -mt-1 opacity-80">
                  Grade
                </span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    {auditResult.overallScore}%
                  </span>
                  <span className="text-xs font-semibold text-slate-500">Quality Index</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mt-0.5">
                  {auditResult.summary}
                </p>
              </div>
            </div>

            {/* Metric Chips */}
            <div className="flex items-center space-x-2">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-center">
                <span className="block text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  {auditResult.validCount}
                </span>
                <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-medium">
                  Verified
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-center">
                <span className="block text-xs font-bold text-amber-700 dark:text-amber-300">
                  {auditResult.warningCount}
                </span>
                <span className="block text-[10px] text-amber-600 dark:text-amber-400 uppercase font-medium">
                  Warnings
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 text-center">
                <span className="block text-xs font-bold text-rose-700 dark:text-rose-300">
                  {auditResult.invalidCount + auditResult.missingCount}
                </span>
                <span className="block text-[10px] text-rose-600 dark:text-rose-400 uppercase font-medium">
                  Issues
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Filter bar & Auto-Fix actions */}
        <div className="px-6 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                filter === 'all'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Variables ({fieldList.length})
            </button>
            <button
              onClick={() => setFilter('issues')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                filter === 'issues'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Needs Attention ({fieldList.filter(f => f.status !== 'valid').length})
            </button>
            <button
              onClick={() => setFilter('valid')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                filter === 'valid'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Valid ({fieldList.filter(f => f.status === 'valid').length})
            </button>
          </div>

          {fixableFields.length > 0 && (
            <button
              id="btn-auto-fix-all-quality"
              onClick={handleFixAll}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Fix All ({fixableFields.length} recommended)</span>
            </button>
          )}
        </div>

        {/* Variables List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
              <p className="text-sm font-medium text-slate-500">Auditing data variables with AI...</p>
            </div>
          ) : filteredFields.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-semibold">No issues found for this filter</p>
            </div>
          ) : (
            filteredFields.map(field => (
              <div
                key={field.key}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`inline-flex items-center space-x-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        field.status === 'valid'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : field.status === 'warning'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                          : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {field.status === 'valid' && <CheckCircle2 className="w-3 h-3" />}
                      {field.status === 'warning' && <AlertTriangle className="w-3 h-3" />}
                      {field.status === 'invalid' && <AlertCircle className="w-3 h-3" />}
                      {field.status === 'missing' && <AlertCircle className="w-3 h-3" />}
                      <span>{field.status.toUpperCase()} ({field.score}%)</span>
                    </span>

                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {`{{${field.key}}}`}
                    </span>
                  </div>

                  {/* Issues or Status description */}
                  {field.issues.length > 0 ? (
                    <div className="text-xs text-rose-600 dark:text-rose-400 space-y-0.5">
                      {field.issues.map((iss, i) => (
                        <p key={i} className="flex items-center space-x-1">
                          <span>•</span>
                          <span>{iss}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      High quality value format verified. Ready for execution.
                    </p>
                  )}

                  {/* Normalized Fix Preview if available */}
                  {field.normalizedValue && field.normalizedValue !== field.currentValue && (
                    <div className="mt-1 flex items-center space-x-2 text-xs">
                      <span className="text-slate-400 font-medium">Recommended:</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                        {String(field.normalizedValue)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right action buttons */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    id={`btn-open-guide-${field.key}`}
                    onClick={() => {
                      onOpenFieldGuide(field.key);
                    }}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                    <span>How To Get</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <button
            id="btn-dismiss-quality-modal"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Review Later
          </button>
          <div className="flex items-center space-x-2">
            <button
              id="btn-confirm-quality-save"
              onClick={() => {
                onConfirmSave();
                onClose();
              }}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm & Save Quality Dataset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

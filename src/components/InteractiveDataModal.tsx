import React, { useState, useEffect } from 'react';
import { Sparkles, Database, ArrowRight, X, AlertCircle, CheckCircle2, Shield } from 'lucide-react';
import { TestCase } from '../types';

interface InteractiveDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingField: string;
  testCase: TestCase | null;
  siteUrl: string;
  onSaveAndResume: (field: string, value: any) => Promise<void>;
}

export const InteractiveDataModal: React.FC<InteractiveDataModalProps> = ({
  isOpen,
  onClose,
  missingField,
  testCase,
  siteUrl,
  onSaveAndResume,
}) => {
  const [fieldValue, setFieldValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFieldValue('');
    }
  }, [isOpen, missingField]);

  if (!isOpen || !missingField || !testCase) return null;

  const isAuthField = missingField.includes('auth') || missingField.includes('token') || missingField.includes('jwt') || missingField.includes('key');
  const isIdField = missingField.includes('id') || missingField.includes('uuid');

  const handleGenerateSynthetic = () => {
    if (isAuthField) {
      setFieldValue(`mock_bearer_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`);
    } else if (isIdField) {
      setFieldValue(String(Math.floor(Math.random() * 1000) + 1));
    } else if (missingField.includes('email')) {
      setFieldValue(`test.user_${Math.floor(Math.random() * 1000)}@example.com`);
    } else if (missingField.includes('name') || missingField.includes('title')) {
      setFieldValue(`Automated QA Verification Item #${Math.floor(Math.random() * 500)}`);
    } else {
      setFieldValue(`test-value-${Math.random().toString(36).substring(2, 8)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldValue.trim()) return;
    setIsSaving(true);
    try {
      await onSaveAndResume(missingField, fieldValue.trim());
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-emerald-500/40 bg-[#0F111A] p-6 shadow-2xl ring-1 ring-emerald-500/20">
        <div className="flex items-start justify-between border-b border-[#1E2235] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Dataset Requirement Encountered</h3>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                  Interactive Step
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Test case <span className="font-mono text-emerald-300">{testCase.extId}</span> requires a dynamic parameter.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#131622] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
            <div className="text-[11px] font-semibold text-slate-400">Scenario being executed:</div>
            <div className="mt-1 text-xs font-medium text-white">{testCase.title}</div>
            <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-400">
              <span className="rounded bg-[#1A1D2B] px-1.5 py-0.5 text-emerald-400 border border-[#1E2235]">{testCase.spec.requests?.[0]?.method || 'GET'}</span>
              <span className="truncate">{siteUrl}{testCase.spec.requests?.[0]?.path}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                Required Dataset Variable: <code className="text-emerald-400 font-mono text-sm">{`{{${missingField}}}`}</code>
              </label>
              <button
                type="button"
                onClick={handleGenerateSynthetic}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
              >
                <Sparkles className="h-3 w-3" />
                Auto-Generate Mock Value
              </button>
            </div>

            <div className="mt-2 relative">
              <input
                type="text"
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                placeholder={isAuthField ? 'Enter bearer token, API key, or JWT...' : 'Enter test value...'}
                autoFocus
                className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {fieldValue && (
                <div className="absolute right-3 top-3 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              This value will be securely saved into the project's dataset and will automatically populate whenever this variable is encountered.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2B]"
            >
              Cancel Execution
            </button>
            <button
              type="submit"
              disabled={!fieldValue.trim() || isSaving}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
            >
              {isSaving ? (
                'Saving & Resuming...'
              ) : (
                <>
                  <span>Inject Data & Run Test</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

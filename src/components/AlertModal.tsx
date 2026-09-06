import React from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  title,
  message,
  type = 'error',
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0E1017] p-6 shadow-2xl transition-all">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              type === 'error'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            }`}
          >
            {type === 'error' ? (
              <AlertCircle className="h-5 w-5" />
            ) : type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <Info className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              {title || (type === 'error' ? 'Notice' : type === 'success' ? 'Success' : 'Information')}
            </h3>
            <p className="mt-1.5 text-xs text-slate-300 leading-relaxed break-words">{message}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#1A1D2D] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-lg shadow-emerald-900/20"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

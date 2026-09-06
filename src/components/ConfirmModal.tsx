import React from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
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

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0E1017] p-6 shadow-2xl transition-all">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              variant === 'danger'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : variant === 'warning'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}
          >
            {variant === 'danger' ? (
              <Trash2 className="h-5 w-5" />
            ) : variant === 'warning' ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Info className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1">
            <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">{message}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#1A1D2D] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#1E2235] bg-[#141724] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#1A1D2D] hover:text-white transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors shadow-lg ${
              variant === 'danger'
                ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-rose-900/20'
                : variant === 'warning'
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-900/20'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-900/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

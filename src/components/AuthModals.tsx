import React, { useState } from 'react';
import { LogIn, UserPlus, Key, X, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';

interface AuthModalsProps {
  mode: 'login' | 'register' | 'reset' | null;
  onClose: () => void;
  onSuccess: (user: User) => void;
  onSwitchMode: (mode: 'login' | 'register' | 'reset') => void;
}

export const AuthModals: React.FC<AuthModalsProps> = ({ mode, onClose, onSuccess, onSwitchMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!mode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await api.login(email.trim(), password);
        onSuccess(res.user);
        onClose();
      } else if (mode === 'register') {
        const res = await api.registerStandalone(email.trim(), password, name.trim());
        onSuccess(res.user);
        onClose();
      } else if (mode === 'reset') {
        await api.resetPassword(newPassword);
        alert('Password successfully reset! Please login with your new password.');
        onSwitchMode('login');
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2235] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {mode === 'login' ? <LogIn className="h-5 w-5" /> : mode === 'register' ? <UserPlus className="h-5 w-5" /> : <Key className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {mode === 'login' ? 'Sign In to Verity' : mode === 'register' ? 'Standalone Developer Signup' : 'Reset Password'}
              </h3>
              <p className="text-xs text-slate-400">
                {mode === 'login' ? 'Enter credentials to access your testing workspace.' : mode === 'register' ? 'Get 50 free credits and unlimited Docker exports.' : 'Choose a new secure password.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs font-semibold text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="text-xs font-semibold text-slate-300">Your Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Morgan"
                required
                className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div>
              <label className="text-xs font-semibold text-slate-300">Work or Personal Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@domain.com"
                required
                className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div>
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {mode === 'reset' && (
            <div>
              <label className="text-xs font-semibold text-slate-300">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters..."
                required
                minLength={6}
                className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
          >
            {isSubmitting
              ? 'Please wait...'
              : mode === 'login'
              ? 'Sign In to Workspace'
              : mode === 'register'
              ? 'Create Standalone Account'
              : 'Update Password'}
          </button>
        </form>

        <div className="mt-6 border-t border-[#1E2235] pt-4 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <div>
              Don't have an account?{' '}
              <button
                onClick={() => onSwitchMode('register')}
                className="font-semibold text-emerald-400 hover:underline"
              >
                Sign up as Standalone Dev
              </button>
            </div>
          ) : mode === 'register' ? (
            <div>
              Already have an account?{' '}
              <button
                onClick={() => onSwitchMode('login')}
                className="font-semibold text-emerald-400 hover:underline"
              >
                Sign in
              </button>
            </div>
          ) : (
            <button
              onClick={() => onSwitchMode('login')}
              className="font-semibold text-emerald-400 hover:underline"
            >
              Back to Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { LogIn, UserPlus, Key, X, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { signInWithGoogle } from '../services/firebase';
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (!mode) return null;

  const handleGoogleAuth = async () => {
    if (isGoogleLoading) return;
    setError(null);
    setSuccessMessage(null);
    setIsGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        onSuccess(user);
        onClose();
      }
    } catch (err: any) {
      if (
        err?.code !== 'auth/cancelled-popup-request' &&
        err?.code !== 'auth/popup-closed-by-user' &&
        !err?.message?.includes('cancelled-popup-request') &&
        !err?.message?.includes('popup-closed-by-user')
      ) {
        console.error('Google sign-in error:', err);
        setError(err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
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
        setSuccessMessage('Password successfully reset! Please login with your new password.');
        setTimeout(() => {
          onSwitchMode('login');
        }, 1500);
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

        {successMessage && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs font-semibold text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {mode !== 'reset' && (
          <div className="mt-5">
            <button
              type="button"
              id="google-auth-continue-btn"
              onClick={handleGoogleAuth}
              disabled={isGoogleLoading || isSubmitting}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#1E2235] bg-[#06070B] py-2.5 px-4 text-xs font-semibold text-white shadow-md transition hover:border-emerald-500/50 hover:bg-[#131622] disabled:opacity-50"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google Account'}</span>
            </button>

            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-[#1E2235] w-full" />
              <span className="bg-[#0F111A] px-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                or sign in with email
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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

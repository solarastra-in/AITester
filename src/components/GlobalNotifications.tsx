import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  WifiOff,
  FileQuestion,
  XCircle,
  CheckCircle2,
  Info,
  X,
  Server,
  RefreshCw,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import {
  AppNotification,
  onNotification,
  dismissNotification,
  clearNotifications,
} from '../services/notifications';

export const GlobalNotifications: React.FC = () => {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    const unsubscribe = onNotification(setItems);
    return () => unsubscribe();
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      data-testid="global-notifications-container"
      className="fixed top-16 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none"
      aria-live="assertive"
    >
      {items.length > 2 && (
        <div className="flex justify-end pointer-events-auto mb-1">
          <button
            onClick={() => clearNotifications()}
            className="text-[11px] font-medium text-slate-400 hover:text-white bg-[#0D0F18]/90 border border-[#1E2235] px-2.5 py-1 rounded-md transition shadow-md"
          >
            Dismiss all ({items.length})
          </button>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {items.map((notification) => {
          const is404 = notification.statusCode === 404;
          const isConnectionError = notification.statusCode === 0 || (!notification.statusCode && notification.type === 'error');

          const isRed = notification.type === 'error';
          const isYellow = notification.type === 'warning';
          const isGreen = notification.type === 'success';

          return (
            <motion.div
              key={notification.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              data-testid={`notification-${notification.id}`}
              className={`pointer-events-auto relative overflow-hidden rounded-xl border p-4 shadow-2xl backdrop-blur-md transition ${
                isRed
                  ? 'border-red-500/50 bg-[#14080B]/95 text-slate-100 shadow-red-950/60 ring-1 ring-red-500/30'
                  : isYellow
                  ? 'border-amber-500/50 bg-[#161208]/95 text-slate-100 shadow-amber-950/60 ring-1 ring-amber-500/30'
                  : isGreen
                  ? 'border-emerald-500/50 bg-[#07150E]/95 text-slate-100 shadow-emerald-950/60 ring-1 ring-emerald-500/30'
                  : 'border-blue-500/50 bg-[#090F1E]/95 text-slate-100 shadow-blue-950/60 ring-1 ring-blue-500/30'
              }`}
            >
              {/* Top Row: Icon, Badges, Title, Close Button */}
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm ${
                    isRed
                      ? 'border-red-500/40 bg-red-950/60 text-red-400'
                      : isYellow
                      ? 'border-amber-500/40 bg-amber-950/60 text-amber-400'
                      : isGreen
                      ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-400'
                      : 'border-blue-500/40 bg-blue-950/60 text-blue-400'
                  }`}
                >
                  {is404 ? (
                    <FileQuestion className="h-5 w-5" />
                  ) : isConnectionError ? (
                    <WifiOff className="h-5 w-5" />
                  ) : isRed ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : isGreen ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Info className="h-5 w-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Pill Badge */}
                    {is404 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 border border-red-500/40">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                        HTTP 404 NOT FOUND
                      </span>
                    ) : isConnectionError ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 border border-red-500/40">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        CONNECTION FAILED
                      </span>
                    ) : notification.statusCode ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 border border-red-500/40">
                        HTTP {notification.statusCode}
                      </span>
                    ) : null}

                    <span className="text-[11px] text-slate-400">
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <h4 className="mt-1 text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                    {notification.title}
                  </h4>

                  <p className="mt-1 text-xs leading-relaxed text-slate-300 break-words">
                    {notification.message}
                  </p>

                  {/* Technical Details Pill */}
                  {(notification.endpoint || notification.engineUrl) && (
                    <div className="mt-2.5 rounded-md border border-[#2D1B22] bg-[#0E0608]/90 p-2 text-[11px] font-mono text-slate-300 space-y-1">
                      {notification.endpoint && (
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-slate-500 shrink-0">Path:</span>
                          <span className="text-red-300 font-semibold truncate">{notification.endpoint}</span>
                        </div>
                      )}
                      {notification.engineUrl && (
                        <div className="flex items-center gap-1.5 truncate text-[10px]">
                          <span className="text-slate-500 shrink-0">Target:</span>
                          <span className="text-slate-400 truncate">{notification.engineUrl}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  {notification.action && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          notification.action?.onClick();
                          dismissNotification(notification.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500 active:bg-red-700 transition"
                      >
                        <Server className="h-3.5 w-3.5" />
                        <span>{notification.action.label}</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => dismissNotification(notification.id)}
                        className="rounded-lg border border-[#3E2028] bg-[#1C0D12] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#2A141B] hover:text-white transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => dismissNotification(notification.id)}
                  aria-label="Close notification"
                  className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Countdown Progress Bar */}
              {notification.autoDismissMs && notification.autoDismissMs > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 overflow-hidden">
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: notification.autoDismissMs / 1000, ease: 'linear' }}
                    className={`h-full ${
                      isRed
                        ? 'bg-red-500/80'
                        : isYellow
                        ? 'bg-amber-500/80'
                        : isGreen
                        ? 'bg-emerald-500/80'
                        : 'bg-blue-500/80'
                    }`}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

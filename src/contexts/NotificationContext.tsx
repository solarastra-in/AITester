import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  WifiOff,
  FileQuestion,
  ServerCrash,
  CheckCircle2,
  Info,
  X,
  Server,
  ArrowRight,
} from 'lucide-react';

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  statusCode?: number; // 404, 500, 502, 503, 0 (connection)
  endpoint?: string;
  engineUrl?: string;
  timestamp: number;
  autoDismissMs?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface NotificationContextType {
  toasts: ToastItem[];
  notify: (toast: Omit<ToastItem, 'id' | 'timestamp'> & { id?: string }) => string;
  notifyApiError: (params: {
    endpoint?: string;
    statusCode?: number;
    message?: string;
    isConnectionError?: boolean;
    engineUrl?: string;
  }) => string;
  notifyError: (title: string, message: string, options?: Partial<ToastItem>) => string;
  notifySuccess: (title: string, message: string, options?: Partial<ToastItem>) => string;
  notifyWarning: (title: string, message: string, options?: Partial<ToastItem>) => string;
  notifyInfo: (title: string, message: string, options?: Partial<ToastItem>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Event name for dispatching toasts from outside React tree (e.g. api.ts)
export const GLOBAL_TOAST_EVENT = 'verity:global_toast';
export const OPEN_ENGINE_SETTINGS_EVENT = 'verity_open_engine_settings';

/**
 * Global helper to trigger toasts from non-React service modules
 */
export function emitGlobalToast(toast: Omit<ToastItem, 'id' | 'timestamp'> & { id?: string }): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GLOBAL_TOAST_EVENT, { detail: toast }));
  }
}

/**
 * Global helper to trigger API error toasts from api.ts
 */
export function emitApiError(params: {
  endpoint?: string;
  statusCode?: number;
  message?: string;
  isConnectionError?: boolean;
  engineUrl?: string;
}): void {
  const statusCode = params.statusCode;
  const is404 = statusCode === 404;
  const is500 = statusCode !== undefined && statusCode >= 500;
  const isConn = params.isConnectionError || statusCode === 0;

  let title = 'API Service Error';
  if (is404) {
    title = 'API Endpoint Not Found (404)';
  } else if (is500) {
    title = `Backend Server Error (${statusCode})`;
  } else if (isConn) {
    title = 'Backend Connection Refused';
  }

  const defaultMsg = isConn
    ? 'Unable to connect to the backend server. Verify your connection or engine runner.'
    : is404
    ? `The requested endpoint '${params.endpoint || 'API'}' does not exist on this server.`
    : is500
    ? 'The server encountered an internal error while processing the request.'
    : params.message || 'An unexpected error occurred during the API call.';

  emitGlobalToast({
    type: 'error',
    title,
    message: params.message || defaultMsg,
    statusCode: params.statusCode,
    endpoint: params.endpoint,
    engineUrl: params.engineUrl,
    autoDismissMs: 7000,
    action: {
      label: 'Configure Engine',
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(OPEN_ENGINE_SETTINGS_EVENT));
        }
      },
    },
  });
}

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastEmittedRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const notify = useCallback(
    (item: Omit<ToastItem, 'id' | 'timestamp'> & { id?: string }): string => {
      const id = item.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const autoDismissMs =
        item.autoDismissMs !== undefined ? item.autoDismissMs : item.type === 'error' ? 7000 : 4500;

      // Deduplicate identical errors within 2.5s to avoid flood
      const dedupKey = `${item.type}:${item.statusCode || ''}:${item.endpoint || ''}:${item.title}`;
      const lastTime = lastEmittedRef.current.get(dedupKey);
      const now = Date.now();
      if (lastTime && now - lastTime < 2500) {
        return id; // ignore duplicate burst
      }
      lastEmittedRef.current.set(dedupKey, now);

      const newToast: ToastItem = {
        ...item,
        id,
        timestamp: now,
        autoDismissMs,
      };

      setToasts((prev) => [newToast, ...prev].slice(0, 4));

      if (autoDismissMs > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, autoDismissMs);
      }

      return id;
    },
    [dismissToast]
  );

  const notifyApiError = useCallback(
    (params: {
      endpoint?: string;
      statusCode?: number;
      message?: string;
      isConnectionError?: boolean;
      engineUrl?: string;
    }): string => {
      const statusCode = params.statusCode;
      const is404 = statusCode === 404;
      const is500 = statusCode !== undefined && statusCode >= 500;
      const isConn = params.isConnectionError || statusCode === 0;

      let title = 'API Service Error';
      if (is404) {
        title = 'API Endpoint Not Found (404)';
      } else if (is500) {
        title = `Backend Server Error (${statusCode})`;
      } else if (isConn) {
        title = 'Backend Connection Refused';
      }

      const defaultMsg = isConn
        ? 'Unable to connect to the backend server. Verify your connection or engine runner.'
        : is404
        ? `The requested endpoint '${params.endpoint || 'API'}' does not exist on this server.`
        : is500
        ? 'The server encountered an internal error while processing the request.'
        : params.message || 'An unexpected error occurred during the API call.';

      return notify({
        type: 'error',
        title,
        message: params.message || defaultMsg,
        statusCode: params.statusCode,
        endpoint: params.endpoint,
        engineUrl: params.engineUrl,
        autoDismissMs: 7000,
        action: {
          label: 'Configure Engine',
          onClick: () => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent(OPEN_ENGINE_SETTINGS_EVENT));
            }
          },
        },
      });
    },
    [notify]
  );

  const notifyError = useCallback(
    (title: string, message: string, options?: Partial<ToastItem>) => {
      return notify({
        type: 'error',
        title,
        message,
        ...options,
      });
    },
    [notify]
  );

  const notifySuccess = useCallback(
    (title: string, message: string, options?: Partial<ToastItem>) => {
      return notify({
        type: 'success',
        title,
        message,
        ...options,
      });
    },
    [notify]
  );

  const notifyWarning = useCallback(
    (title: string, message: string, options?: Partial<ToastItem>) => {
      return notify({
        type: 'warning',
        title,
        message,
        ...options,
      });
    },
    [notify]
  );

  const notifyInfo = useCallback(
    (title: string, message: string, options?: Partial<ToastItem>) => {
      return notify({
        type: 'info',
        title,
        message,
        ...options,
      });
    },
    [notify]
  );

  // Listen to global events from outside React context (like api.ts)
  useEffect(() => {
    const handleGlobalToast = (e: Event) => {
      const customEvent = e as CustomEvent<Omit<ToastItem, 'id' | 'timestamp'> & { id?: string }>;
      if (customEvent.detail) {
        notify(customEvent.detail);
      }
    };

    window.addEventListener(GLOBAL_TOAST_EVENT, handleGlobalToast);
    return () => {
      window.removeEventListener(GLOBAL_TOAST_EVENT, handleGlobalToast);
    };
  }, [notify]);

  return (
    <NotificationContext.Provider
      value={{
        toasts,
        notify,
        notifyApiError,
        notifyError,
        notifySuccess,
        notifyWarning,
        notifyInfo,
        dismissToast,
        clearToasts,
      }}
    >
      {children}

      {/* Persistent non-intrusive Toast Container in bottom-right corner */}
      <aside
        aria-label="Notifications"
        className="fixed bottom-5 right-5 z-50 flex flex-col-reverse gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none"
        data-testid="toast-container-bottom-right"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const isRed = toast.type === 'error';
            const isYellow = toast.type === 'warning';
            const isGreen = toast.type === 'success';

            const is404 = toast.statusCode === 404;
            const is500 = toast.statusCode !== undefined && toast.statusCode >= 500;
            const isConn = toast.statusCode === 0 || (!toast.statusCode && isRed);

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                data-testid={`toast-${toast.id}`}
                className={`pointer-events-auto relative overflow-hidden rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition ${
                  isRed
                    ? 'border-red-500/40 bg-[#12080A]/95 text-slate-100 shadow-red-950/50'
                    : isYellow
                    ? 'border-amber-500/40 bg-[#140F06]/95 text-slate-100 shadow-amber-950/50'
                    : isGreen
                    ? 'border-emerald-500/40 bg-[#06140D]/95 text-slate-100 shadow-emerald-950/50'
                    : 'border-blue-500/40 bg-[#080E1B]/95 text-slate-100 shadow-blue-950/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Status Icon */}
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm ${
                      isRed
                        ? 'border-red-500/30 bg-red-950/50 text-red-400'
                        : isYellow
                        ? 'border-amber-500/30 bg-amber-950/50 text-amber-400'
                        : isGreen
                        ? 'border-emerald-500/30 bg-emerald-950/50 text-emerald-400'
                        : 'border-blue-500/30 bg-blue-950/50 text-blue-400'
                    }`}
                  >
                    {is404 ? (
                      <FileQuestion className="h-4 w-4" />
                    ) : is500 ? (
                      <ServerCrash className="h-4 w-4" />
                    ) : isConn ? (
                      <WifiOff className="h-4 w-4" />
                    ) : isRed ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : isGreen ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Info className="h-4 w-4" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status Badges */}
                      {is404 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 border border-red-500/40">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                          HTTP 404
                        </span>
                      ) : is500 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 border border-red-500/40">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                          HTTP {toast.statusCode}
                        </span>
                      ) : isConn ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 border border-red-500/40">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                          CONN ERR
                        </span>
                      ) : toast.statusCode ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-300 border border-slate-700">
                          HTTP {toast.statusCode}
                        </span>
                      ) : null}

                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(toast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    <h4 className="mt-1 text-xs font-semibold tracking-tight text-white leading-tight">
                      {toast.title}
                    </h4>

                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300 line-clamp-2 break-words">
                      {toast.message}
                    </p>

                    {/* Path / Endpoint if present */}
                    {toast.endpoint && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-mono text-slate-400 truncate bg-black/40 px-2 py-0.5 rounded border border-white/5">
                        <span className="text-slate-500 shrink-0">Path:</span>
                        <span className="text-red-300 truncate">{toast.endpoint}</span>
                      </div>
                    )}

                    {/* Optional action */}
                    {toast.action && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            toast.action?.onClick();
                            dismissToast(toast.id);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-red-600/90 hover:bg-red-500 px-2 py-1 text-[11px] font-semibold text-white transition shadow-sm"
                        >
                          <Server className="h-3 w-3" />
                          <span>{toast.action.label}</span>
                          <ArrowRight className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="Dismiss toast"
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Progress bar */}
                {toast.autoDismissMs && toast.autoDismissMs > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/40 overflow-hidden">
                    <motion.div
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: toast.autoDismissMs / 1000, ease: 'linear' }}
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
      </aside>
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

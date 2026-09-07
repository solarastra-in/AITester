export type NotificationType = 'error' | 'warning' | 'info' | 'success';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  statusCode?: number;
  endpoint?: string;
  engineUrl?: string;
  timestamp: number;
  autoDismissMs?: number;
  action?: {
    label: string;
    onClick: () => void;
    isPrimary?: boolean;
  };
}

export const NOTIFICATION_EVENT = 'verity_notification_event';
export const OPEN_ENGINE_SETTINGS_EVENT = 'verity_open_engine_settings';

let notifications: AppNotification[] = [];
const listeners = new Set<(items: AppNotification[]) => void>();

function emit() {
  const snapshot = [...notifications];
  listeners.forEach(fn => {
    try {
      fn(snapshot);
    } catch (err) {
      console.error('Error in notification listener:', err);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: snapshot }));
  }
}

export function getActiveNotifications(): AppNotification[] {
  return [...notifications];
}

export function notify(item: Omit<AppNotification, 'id' | 'timestamp'> & { id?: string }): string {
  const id = item.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const autoDismissMs = item.autoDismissMs !== undefined ? item.autoDismissMs : (item.type === 'error' ? 8000 : 5000);

  // Prevent duplicate notifications within 3 seconds for same endpoint + status
  const recentIdx = notifications.findIndex(n => 
    n.endpoint === item.endpoint && 
    n.statusCode === item.statusCode && 
    (Date.now() - n.timestamp) < 3000
  );

  const notification: AppNotification = {
    ...item,
    id,
    timestamp: Date.now(),
    autoDismissMs,
  };

  if (recentIdx >= 0) {
    // Replace recent duplicate and refresh timestamp
    notifications[recentIdx] = notification;
  } else {
    // Keep maximum 5 notifications visible
    notifications = [notification, ...notifications].slice(0, 5);
  }

  emit();

  if (autoDismissMs > 0) {
    setTimeout(() => {
      dismissNotification(id);
    }, autoDismissMs);
  }

  return id;
}

export function dismissNotification(id: string): void {
  const prevLen = notifications.length;
  notifications = notifications.filter(n => n.id !== id);
  if (notifications.length !== prevLen) {
    emit();
  }
}

export function clearNotifications(): void {
  if (notifications.length > 0) {
    notifications = [];
    emit();
  }
}

export function onNotification(callback: (items: AppNotification[]) => void): () => void {
  listeners.add(callback);
  callback([...notifications]);
  return () => {
    listeners.delete(callback);
  };
}

export function openEngineSettings(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_ENGINE_SETTINGS_EVENT));
  }
}

/**
 * Triggers a global notification specifically for API service errors (404, connection failure, etc.)
 */
export function notifyApiError(params: {
  endpoint: string;
  message: string;
  statusCode?: number;
  engineUrl?: string;
  isConnectionError?: boolean;
}): string {
  const is404 = params.statusCode === 404;
  const isConn = params.isConnectionError || params.statusCode === 0;

  const title = is404
    ? 'API Endpoint Not Found (HTTP 404)'
    : isConn
    ? 'Verity API Connection Failure'
    : `API Service Error (${params.statusCode || 'Unknown'})`;

  return notify({
    type: 'error',
    title,
    message: params.message,
    statusCode: params.statusCode,
    endpoint: params.endpoint,
    engineUrl: params.engineUrl,
    autoDismissMs: 9000,
    action: {
      label: 'Configure Engine',
      onClick: () => openEngineSettings(),
      isPrimary: true,
    },
  });
}

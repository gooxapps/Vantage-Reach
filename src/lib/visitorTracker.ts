import { getAuthToken } from './api';

const VISITOR_STORAGE_KEY = 'vr_visitor_id';
const SESSION_STORAGE_KEY = 'vr_visit_session_id';

let trackerInitialized = false;
let lastTrackedPath = '';
let lastTrackedAt = 0;

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function getVisitorId(): string {
  try {
    let vid = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (!vid) {
      vid = randomId('vis');
      localStorage.setItem(VISITOR_STORAGE_KEY, vid);
    }
    return vid;
  } catch {
    return randomId('vis');
  }
}

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      sid = randomId('ses');
      sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    return randomId('ses');
  }
}

function isRunningAsPwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function getClientEnvironment() {
  if (typeof window === 'undefined') {
    return {
      screenResolution: '',
      viewportSize: '',
      timezone: '',
      language: '',
      platform: '',
      networkType: '',
      isPwa: false,
      referrer: '',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
    };
  }

  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }

  const nav = window.navigator as Navigator & {
    connection?: { effectiveType?: string };
    userAgentData?: { platform?: string };
  };

  const params = new URLSearchParams(window.location.search);

  return {
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    timezone,
    language: nav.language || '',
    platform: nav.userAgentData?.platform || nav.platform || '',
    networkType: nav.connection?.effectiveType || '',
    isPwa: isRunningAsPwa(),
    referrer: document.referrer || '',
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
  };
}

async function sendTelemetry(
  eventType:
    | 'session_start'
    | 'page_view'
    | 'screen_view'
    | 'heartbeat'
    | 'auth_login'
    | 'auth_register'
    | 'action',
  pagePath: string,
  pageTitle = '',
  details: Record<string, unknown> = {}
) {
  if (typeof window === 'undefined') return;
  try {
    const token = getAuthToken();
    const env = getClientEnvironment();
    await fetch('/api/analytics/track', {
      method: 'POST',
      credentials: 'include',
      keepalive: eventType === 'heartbeat' || eventType === 'auth_login',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        visitorId: getVisitorId(),
        sessionId: getSessionId(),
        eventType,
        pagePath,
        pageTitle: pageTitle || document.title || '',
        ...env,
        details,
      }),
    });
  } catch {
    // Telemetry must never interrupt user experience
  }
}

export function initVisitorTracker(initialPath?: string) {
  if (trackerInitialized || typeof window === 'undefined') return;
  trackerInitialized = true;

  const entryPath = initialPath || window.location.pathname || '/';
  lastTrackedPath = entryPath;
  lastTrackedAt = Date.now();

  void sendTelemetry('session_start', entryPath, document.title);

  // Send lightweight heartbeat every 30s while tab is visible so admin sees real-time online visitors
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void sendTelemetry('heartbeat', lastTrackedPath || '/');
    }
  }, 30_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void sendTelemetry('heartbeat', lastTrackedPath || '/');
    }
  });

  window.addEventListener('online', () => {
    void sendTelemetry('heartbeat', lastTrackedPath || '/');
  });
}

export function trackScreenView(pagePath: string, pageTitle?: string, details: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (lastTrackedPath === pagePath && now - lastTrackedAt < 1200) {
    return;
  }
  lastTrackedPath = pagePath;
  lastTrackedAt = now;
  void sendTelemetry('screen_view', pagePath, pageTitle || document.title, details);
}

export function trackAuthEvent(eventType: 'auth_login' | 'auth_register', pagePath = '/dashboard') {
  if (typeof window === 'undefined') return;
  lastTrackedPath = pagePath;
  lastTrackedAt = Date.now();
  void sendTelemetry(eventType, pagePath, document.title);
}

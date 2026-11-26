import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PlatformHint = 'ios' | 'android' | 'desktop-mac' | 'desktop-windows' | 'desktop';

export type UpdateSyncState = 'idle' | 'checking' | 'updating' | 'up-to-date';

export interface PwaSyncSnapshot {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  platformHint: PlatformHint;
  updateState: UpdateSyncState;
  lastSyncedAt: string | null;
  buildId: string;
}

const listeners = new Set<() => void>();
let initialized = false;
let swRegistration: ServiceWorkerRegistration | null = null;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let isInstalledState = false;
let isIOSState = false;
let platformHintState: PlatformHint = 'desktop';
let updateStateValue: UpdateSyncState = 'idle';
let lastSyncedAtValue: string | null = null;
let reloadingForUpdate = false;
let userRequestedReload = false;
let lastServerBootId: string | null = null;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): { isIOS: boolean; platformHint: PlatformHint } {
  if (typeof window === 'undefined') {
    return { isIOS: false, platformHint: 'desktop' };
  }
  const ua = window.navigator.userAgent.toLowerCase();
  const platform = (window.navigator.platform || '').toLowerCase();
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;

  const isIOS = /iphone|ipad|ipod/.test(ua) || (platform.includes('mac') && maxTouchPoints > 1);
  if (isIOS) return { isIOS: true, platformHint: 'ios' };
  if (/android/.test(ua)) return { isIOS: false, platformHint: 'android' };
  if (platform.includes('mac') || /macintosh/.test(ua)) {
    return { isIOS: false, platformHint: 'desktop-mac' };
  }
  if (platform.includes('win') || /windows/.test(ua)) {
    return { isIOS: false, platformHint: 'desktop-windows' };
  }
  return { isIOS: false, platformHint: 'desktop' };
}

function setUpdateState(next: UpdateSyncState) {
  updateStateValue = next;
  notify();
}

function triggerReloadForUpdate() {
  if (!userRequestedReload || reloadingForUpdate || typeof window === 'undefined') return;
  reloadingForUpdate = true;
  setUpdateState('updating');
  window.setTimeout(() => {
    window.location.reload();
  }, 200);
}

async function checkServerVersionAndSync(manual = false): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.onLine) return false;
  if (manual) {
    userRequestedReload = true;
    setUpdateState('checking');
  }

  let updated = false;
  try {
    if (swRegistration) {
      await swRegistration.update();
      if (manual && swRegistration.waiting) {
        if (updateSWFn) {
          await updateSWFn(true);
        } else {
          swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        updated = true;
      }
    }
  } catch {
    // Ignore transient SW update check failures when offline or in restricted iframes
  }

  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { bootId?: string; timestamp?: string };
      if (data.bootId) {
        lastServerBootId = data.bootId;
      }
      lastSyncedAtValue = new Date().toISOString();
    }
  } catch {
    // Ignore transient network errors
  }

  if (manual && !reloadingForUpdate && !updated) {
    userRequestedReload = false;
    setUpdateState('up-to-date');
    window.setTimeout(() => {
      if (updateStateValue === 'up-to-date') {
        setUpdateState('idle');
      }
    }, 3500);
  } else if (!reloadingForUpdate) {
    notify();
  }

  return updated;
}

export function initPwaSync() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  isInstalledState = detectStandalone();
  const platformInfo = detectPlatform();
  isIOSState = platformInfo.isIOS;
  platformHintState = platformInfo.platformHint;

  // Capture beforeinstallprompt immediately so it is never lost before UI components mount
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    isInstalledState = true;
    deferredPrompt = null;
    notify();
  });

  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  const onDisplayModeChange = () => {
    isInstalledState = detectStandalone();
    notify();
  };
  if (typeof standaloneMedia.addEventListener === 'function') {
    standaloneMedia.addEventListener('change', onDisplayModeChange);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (userRequestedReload) {
        triggerReloadForUpdate();
      }
    });

    try {
      const updateSW = registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          if (!registration) return;
          swRegistration = registration;
          lastSyncedAtValue = new Date().toISOString();
          notify();

          // Periodically check for updates in the background every 5 minutes without forcing a reload
          window.setInterval(() => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
              void checkServerVersionAndSync(false);
            }
          }, 300_000);
        },
        onNeedRefresh() {
          // Wait for explicit user sync or next cold launch so active forms and tabs are never interrupted
          notify();
        },
        onRegisterError() {
          // Ignore service worker registration errors in restricted preview iframes
        },
      });
      updateSWFn = updateSW;
    } catch {
      // Non-fatal in environments that block service workers
    }
  }

  // Sync data quietly when returning to the app or reconnecting online
  const syncOnResume = () => {
    if (document.visibilityState === 'visible') {
      window.dispatchEvent(new CustomEvent('vantage:app-sync'));
    }
  };
  document.addEventListener('visibilitychange', syncOnResume);
  window.addEventListener('online', () => {
    void checkServerVersionAndSync(false);
    window.dispatchEvent(new CustomEvent('vantage:app-sync'));
  });
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    isInstalledState = true;
    deferredPrompt = null;
    notify();
    return true;
  }
  return false;
}

export async function checkForAppUpdate(): Promise<boolean> {
  return checkServerVersionAndSync(true);
}

export function getPwaSyncSnapshot(): PwaSyncSnapshot {
  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled: isInstalledState,
    isIOS: isIOSState,
    platformHint: platformHintState,
    updateState: updateStateValue,
    lastSyncedAt: lastSyncedAtValue,
    buildId: typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev',
  };
}

export function subscribePwaSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  BarChart3,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Crown,
  Home,
  LogOut,
  Megaphone,
  Plus,
  PlusCircle,
  Rocket,
  User,
  X,
} from 'lucide-react';
import { AdminConsoleView } from './components/AdminConsoleView';
import { AuthViews } from './components/AuthViews';
import { BrandSplashScreen, VantageLogo } from './components/BrandMark';
import { CampaignsView } from './components/CampaignsView';
import { CreatorVipModal } from './components/CreatorVipModal';
import { CustomerDashboard } from './components/CustomerDashboard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PackagesAndCheckoutView } from './components/PackagesAndCheckoutView';
import { ProfileView } from './components/ProfileView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReportsView } from './components/ReportsView';
import { SubmitVideoView } from './components/SubmitVideoView';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  ApiError,
  api,
  formatDate,
  formatDateTime,
  formatStatusLabel,
  getAuthToken,
  onUnauthorized,
  setAuthToken,
} from './lib/api';
import { useSiteConfig } from './lib/siteConfig';
import { initVisitorTracker, trackScreenView } from './lib/visitorTracker';
import type { NotificationRecord, UserSession, VideoRecord } from './types';

type NavTab = 'dashboard' | 'submit' | 'plans' | 'campaigns' | 'reports' | 'profile';

const VALID_TABS: NavTab[] = ['dashboard', 'submit', 'plans', 'campaigns', 'reports', 'profile'];
const ACTIVE_TAB_KEY = 'vr_active_tab';

function getInitials(fullName: string, email: string): string {
  const source = (fullName || email.split('@')[0] || 'VR').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function App() {
  const { siteConfig } = useSiteConfig();
  const [bootSplashDone, setBootSplashDone] = useState(
    () => !siteConfig.splashEnabled || siteConfig.splashDurationMs <= 0
  );
  const [user, setUser] = useState<UserSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [vipOfferVideo, setVipOfferVideo] = useState<VideoRecord | null>(null);
  const [paymentBanner, setPaymentBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentSyncSeq, setPaymentSyncSeq] = useState(0);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const mobileNotifSheetRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get<{ notifications: NotificationRecord[] }>('/api/notifications');
      setNotifications(res.notifications || []);
    } catch {
      // Ignore notification background fetch errors
    }
  }, []);

  const refreshMe = async (retryOnTransient = true) => {
    try {
      const res = await api.get<{ user: UserSession }>('/api/auth/me');
      setUser(res.user);
      if (!res.user.isAdmin) {
        fetchNotifications();
      }
      setCheckingAuth(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null);
        setUser(null);
        setCheckingAuth(false);
        return;
      }
      // Transient cold-start / network error when a token exists: retry once quietly
      if (retryOnTransient && getAuthToken()) {
        window.setTimeout(() => {
          void refreshMe(false);
        }, 600);
        return;
      }
      setCheckingAuth(false);
    }
  };

  const { updateState } = usePWAInstall();
  const isAuthedRef = useRef(false);
  const isAdminRef = useRef(false);
  isAuthedRef.current = Boolean(user);
  isAdminRef.current = Boolean(user?.isAdmin);

  useEffect(() => {
    if (bootSplashDone) return;
    const ms = Math.min(4000, Math.max(0, siteConfig.splashDurationMs || 900));
    if (!siteConfig.splashEnabled || ms === 0) {
      setBootSplashDone(true);
      return;
    }
    const timer = window.setTimeout(() => setBootSplashDone(true), ms);
    return () => window.clearTimeout(timer);
  }, [bootSplashDone, siteConfig.splashEnabled, siteConfig.splashDurationMs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as NavTab | null;
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
      try {
        sessionStorage.setItem(ACTIVE_TAB_KEY, tabParam);
      } catch {
        // Ignore
      }
    } else {
      try {
        const savedTab = sessionStorage.getItem(ACTIVE_TAB_KEY) as NavTab | null;
        if (savedTab && VALID_TABS.includes(savedTab)) {
          setActiveTab(savedTab);
        }
      } catch {
        // Ignore
      }
    }

    initVisitorTracker();
    void refreshMe(true);
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      setActiveTab('dashboard');
      setSelectedVideoId(null);
      setNotifications([]);
      try {
        sessionStorage.removeItem(ACTIVE_TAB_KEY);
      } catch {
        // Ignore
      }
    });
    const handleAppSync = () => {
      if (isAuthedRef.current && !isAdminRef.current) {
        fetchNotifications();
      }
    };
    window.addEventListener('vantage:app-sync', handleAppSync);
    return () => {
      unsubscribe();
      window.removeEventListener('vantage:app-sync', handleAppSync);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user || user.isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('tx_ref') || params.get('reference') || params.get('trxref');
    const transactionId = params.get('transaction_id');
    const callbackStatus = params.get('status');

    if (txRef) {
      const cleanUrl = params.get('tab') ? `/?tab=${encodeURIComponent(params.get('tab')!)}` : '/';
      window.history.replaceState({}, document.title, cleanUrl);

      if (callbackStatus === 'cancelled') {
        setPaymentBanner({
          type: 'error',
          text: `Checkout for reference ${txRef} was cancelled before completion.`,
        });
        return;
      }

      api
        .post<{ verified?: boolean; alreadyVerified?: boolean; failureReason?: string }>('/api/payments/verify', {
          txRef,
          providerTransactionId: transactionId || undefined,
        })
        .then((res) => {
          if (res.verified || res.alreadyVerified) {
            setPaymentBanner({
              type: 'success',
              text: `Payment ${txRef} verified on server. Your order is now queued.`,
            });
            setPaymentSyncSeq((n) => n + 1);
            window.dispatchEvent(new CustomEvent('vantage:app-sync'));
            void refreshMe(false);
            fetchNotifications();
          } else {
            setPaymentBanner({
              type: 'error',
              text: `Payment ${txRef} could not be verified: ${res.failureReason || 'Declined'}`,
            });
          }
        })
        .catch((err: any) => {
          setPaymentBanner({
            type: 'error',
            text: err?.message || `Unable to verify payment reference ${txRef}.`,
          });
        });
    }
  }, [user?.id, fetchNotifications]);

  useEffect(() => {
    if (user) {
      if (user.isAdmin) {
        trackScreenView('/admin', `${siteConfig.appName} Admin`);
      } else {
        trackScreenView(`/${activeTab}`, `${siteConfig.appName} · ${activeTab}`);
      }
    }
  }, [activeTab, user?.id, user?.isAdmin, siteConfig.appName]);

  useEffect(() => {
    if (!user || user.isAdmin) return;
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void fetchNotifications();
      }
    }, 25_000);
    return () => window.clearInterval(poll);
  }, [user?.id, user?.isAdmin, fetchNotifications]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideBell = notifRef.current?.contains(target);
      const insideMobileSheet = mobileNotifSheetRef.current?.contains(target);
      if (!insideBell && !insideMobileSheet) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setSelectedNotification(null);
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleNavigate = (tab: string, videoId?: number) => {
    if (videoId) setSelectedVideoId(videoId);
    const nextTab = tab as NavTab;
    setActiveTab(nextTab);
    try {
      if (VALID_TABS.includes(nextTab)) {
        sessionStorage.setItem(ACTIVE_TAB_KEY, nextTab);
      }
    } catch {
      // Ignore
    }
    setNotifOpen(false);
    setProfileMenuOpen(false);
    if (tab === 'dashboard') fetchNotifications();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Ignore network errors on sign out
    }
    setAuthToken(null);
    setUser(null);
    setActiveTab('dashboard');
    setSelectedVideoId(null);
    setNotifications([]);
    setNotifOpen(false);
    setProfileMenuOpen(false);
    try {
      sessionStorage.removeItem(ACTIVE_TAB_KEY);
    } catch {
      // Ignore
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await api.post('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      window.dispatchEvent(new CustomEvent('vantage:notifications-sync'));
    } catch {
      // Ignore
    }
  };

  const resolveNotificationDestination = (
    linkPath?: string | null
  ): { tab: NavTab; label: string; videoId?: number } | null => {
    const p = (linkPath || '').trim();
    if (!p) return null;
    if (p.includes('submit')) return { tab: 'submit', label: 'Drop Video & Channel' };
    if (p.includes('campaign') || p.includes('video')) return { tab: 'campaigns', label: 'View My Campaigns' };
    if (p.includes('plan') || p.includes('seo')) return { tab: 'plans', label: 'Promote ($1 VIP)' };
    if (p.includes('report')) return { tab: 'reports', label: 'View Reports' };
    if (p.includes('profile')) return { tab: 'profile', label: 'Open Profile & Settings' };
    if (p === '/') return { tab: 'dashboard', label: 'Go to Dashboard' };
    return null;
  };

  const handleNotificationClick = async (n: NotificationRecord) => {
    setNotifOpen(false);
    setSelectedNotification({ ...n, is_read: 1 });
    if (n.is_read === 0) {
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item)));
      try {
        await api.post(`/api/notifications/${n.id}/read`);
        window.dispatchEvent(new CustomEvent('vantage:notifications-sync'));
      } catch {
        // Ignore
      }
    }
  };

  if (!bootSplashDone) {
    return (
      <>
        <OfflineIndicator />
        <BrandSplashScreen config={siteConfig} onSkip={() => setBootSplashDone(true)} />
      </>
    );
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <VantageLogo
            size={44}
            logoUrl={siteConfig.logoUrl}
            alt={siteConfig.appName}
            accentColor={siteConfig.themeColor}
          />
          <p className="text-xs font-semibold text-slate-500">Loading {siteConfig.appName}...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <OfflineIndicator />
        <AuthViews
          onAuthenticated={(u) => {
            setUser(u);
            setCheckingAuth(false);
            if (!u.isAdmin) {
              setActiveTab('dashboard');
              try {
                sessionStorage.setItem(ACTIVE_TAB_KEY, 'dashboard');
              } catch {
                // Ignore
              }
              fetchNotifications();
            }
          }}
        />
      </>
    );
  }

  if (user.isAdmin) {
    return (
      <>
        <OfflineIndicator />
        <AdminConsoleView
          user={user}
          onLogout={handleLogout}
          onUserUpdated={() => void refreshMe(false)}
          updateState={updateState}
        />
      </>
    );
  }

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;
  const initials = getInitials(user.fullName, user.email);

  const sidebarItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'submit', label: 'Drop Video', icon: PlusCircle },
    { id: 'plans', label: 'Promote ($1 VIP)', icon: Crown },
    { id: 'campaigns', label: 'My Campaigns', icon: Rocket },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'profile', label: 'Profile & Settings', icon: User },
  ];

  return (
    <div className="min-h-screen bg-white lg:bg-slate-50 text-slate-900 flex flex-col lg:flex-row relative overflow-x-clip">
      <OfflineIndicator />

      {updateState === 'updating' && (
        <div
          role="status"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-[#1D4ED8] shadow-md whitespace-nowrap"
        >
          <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-ping" />
          <span>Syncing latest {siteConfig.appName} update...</span>
        </div>
      )}

      {/* Subtle Top-Right Decorative Wash matching Mobile Dashboard Reference */}
      {(activeTab === 'dashboard' || activeTab === 'campaigns' || activeTab === 'submit') && (
        <div
          aria-hidden="true"
          className="lg:hidden pointer-events-none absolute top-0 right-0 w-64 h-64 rounded-full bg-blue-50/85 blur-2xl -translate-y-14 translate-x-14"
        />
      )}

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-100">
          <VantageLogo
            size={34}
            logoUrl={siteConfig.logoUrl}
            alt={siteConfig.appName}
            accentColor={siteConfig.themeColor}
          />
          <span className="text-base font-extrabold text-slate-900 font-display tracking-tight truncate">
            {siteConfig.appName}
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-[#2563EB] font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#2563EB]' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2.5">
          <PWAInstallButton />
          <div className="text-xs text-slate-500 truncate flex items-center gap-1.5">
            <span className="truncate">
              Signed in as <strong className="text-slate-800">{user.fullName || user.email}</strong>
            </span>
            {user.isVip && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 shrink-0">
                <Crown className="w-3 h-3" />
                VIP
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 relative z-10">
        {/* Top App Bar: Mobile Reference Header + Desktop Breadcrumb Header */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 bg-white/90 lg:bg-white/95 backdrop-blur-md lg:border-b lg:border-slate-200 px-3.5 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 pt-safe">
          {/* Mobile Brand Lockup (Top Left) */}
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="flex items-center gap-2 min-w-0 lg:hidden text-left min-h-[44px]"
            aria-label={`${siteConfig.appName} Home`}
          >
            <VantageLogo
              size={34}
              logoUrl={siteConfig.logoUrl}
              alt={siteConfig.appName}
              accentColor={siteConfig.themeColor}
            />
            <span className="text-[15px] font-extrabold text-slate-900 font-display leading-tight tracking-tight truncate max-w-[140px]">
              {siteConfig.appName}
            </span>
          </button>

          {/* Desktop Breadcrumb */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-medium text-slate-500">
            <span>{siteConfig.companyName}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-900 font-semibold">
              {sidebarItems.find((i) => i.id === activeTab)?.label || 'Dashboard'}
            </span>
          </div>

          {/* Top Right Controls: Install App + Notifications Bell + Profile Avatar */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            <div className="lg:hidden">
              <PWAInstallButton compact />
            </div>

            {/* Notification Bell + Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setProfileMenuOpen(false);
                  if (!notifOpen) fetchNotifications();
                }}
                aria-label="Notifications"
                className="relative min-h-[44px] min-w-[44px] rounded-full hover:bg-slate-100/80 flex items-center justify-center text-slate-800 transition-colors"
              >
                <Bell className="w-[22px] h-[22px]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center leading-none ring-2 ring-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  {/* Desktop Popover */}
                  <div className="hidden sm:block absolute right-0 mt-2 w-96 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900">Notifications</span>
                      {unreadCount > 0 ? (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="min-h-[32px] px-2.5 rounded-lg text-xs font-semibold text-[#2563EB] hover:bg-blue-50 inline-flex items-center gap-1"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark all read</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400">All caught up</span>
                      )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <p className="p-6 text-xs text-slate-500 text-center">No notifications yet.</p>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleNotificationClick(n)}
                            className={`w-full px-4 py-3.5 text-left hover:bg-slate-50 transition-colors ${
                              n.is_read === 0 ? 'bg-blue-50/45' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-bold text-slate-900 leading-snug">{n.title}</p>
                              <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                {formatDate(n.created_at)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Profile Avatar + Quick Menu */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((o) => !o);
                  setNotifOpen(false);
                }}
                aria-label="Account Menu"
                className="min-h-[44px] pl-1 pr-1.5 rounded-full hover:bg-slate-100/80 flex items-center gap-1 transition-colors"
              >
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white text-xs font-bold flex items-center justify-center ring-2 ring-white shadow-sm">
                  {initials}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 p-1.5">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className="text-xs font-bold text-slate-900 truncate">{user.fullName || 'Creator'}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate('profile')}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Profile & Settings</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate('submit')}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <PlusCircle className="w-4 h-4 text-slate-400" />
                    <span>Drop Video &amp; Channel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate('campaigns')}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <Rocket className="w-4 h-4 text-slate-400" />
                    <span>My Campaigns</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate('plans')}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <Crown className="w-4 h-4 text-slate-400" />
                    <span>Promote ($1 VIP)</span>
                  </button>
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Workspace Content (generous bottom padding prevents fixed bottom nav overlap) */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-28 lg:py-6 lg:pb-10">
          {siteConfig.announcementBanner && (
            <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-900">
              {siteConfig.announcementBanner}
            </div>
          )}
          {paymentBanner && (
            <div
              role="status"
              className={`mb-4 rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 text-sm ${
                paymentBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {paymentBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span className="font-medium truncate sm:whitespace-normal">{paymentBanner.text}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss payment status"
                onClick={() => setPaymentBanner(null)}
                className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center hover:bg-black/5 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {activeTab === 'dashboard' && <CustomerDashboard user={user} onNavigate={handleNavigate} />}
          {activeTab === 'submit' && (
            <SubmitVideoView
              onSubmitted={(video) => {
                setSelectedVideoId(video.id);
                setActiveTab('campaigns');
                setVipOfferVideo(video);
              }}
            />
          )}
          {activeTab === 'plans' && (
            <PackagesAndCheckoutView
              selectedVideoId={selectedVideoId}
              onSelectVideo={setSelectedVideoId}
              onSuccessNavigate={(t) => handleNavigate(t)}
            />
          )}
          {activeTab === 'campaigns' && <CampaignsView key={`cmp-${paymentSyncSeq}`} onNavigate={handleNavigate} />}
          {activeTab === 'reports' && (
            <ReportsView selectedVideoId={selectedVideoId} onSelectVideo={setSelectedVideoId} />
          )}
          {activeTab === 'profile' && (
            <ProfileView
              user={user}
              onLogout={handleLogout}
              onUserUpdated={refreshMe}
              onOpenNotification={(n) => void handleNotificationClick(n)}
            />
          )}
        </main>
      </div>

      {vipOfferVideo && (
        <CreatorVipModal
          video={vipOfferVideo}
          isAlreadyVip={Boolean(user.isVip)}
          onClose={() => setVipOfferVideo(null)}
          onVipActivated={() => {
            setPaymentSyncSeq((n) => n + 1);
            void refreshMe(false);
            fetchNotifications();
          }}
          onViewCampaigns={() => {
            setSelectedVideoId(vipOfferVideo.id);
            setVipOfferVideo(null);
            handleNavigate('campaigns');
          }}
        />
      )}

      {/* Mobile Full-Width Notifications Bottom Sheet */}
      {notifOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Close Notifications"
            onClick={() => setNotifOpen(false)}
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-[1px]"
          />
          <div
            ref={mobileNotifSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="relative z-10 w-full max-h-[82vh] bg-white rounded-t-3xl border-t border-slate-200 shadow-2xl flex flex-col pb-safe"
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#2563EB]" />
                <span className="text-base font-bold text-slate-900">Notifications</span>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-[#2563EB] hover:bg-blue-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Mark all read</span>
                  </button>
                ) : (
                  <span className="text-xs font-medium text-slate-400 px-2">All caught up</span>
                )}
                <button
                  type="button"
                  aria-label="Close Notifications"
                  onClick={() => setNotifOpen(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <p className="p-8 text-sm text-slate-500 text-center">No notifications yet.</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full px-4 py-4 text-left active:bg-slate-100 transition-colors ${
                      n.is_read === 0 ? 'bg-blue-50/45' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900 leading-snug">{n.title}</p>
                      <span className="text-[11px] text-slate-400 shrink-0 tabular-nums pt-0.5">
                        {formatDate(n.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed line-clamp-3">{n.message}</p>
                    <p className="text-[11px] font-semibold text-[#2563EB] mt-2">
                      {n.is_read === 0 ? 'Unread · Tap to read' : 'Tap to view details'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Responsive Notification Detail Sheet / Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Close Notification Details"
            onClick={() => setSelectedNotification(null)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-detail-title"
            className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 pb-safe"
          >
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1 mb-1" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  {formatStatusLabel(selectedNotification.category || 'system')} ·{' '}
                  {formatDateTime(selectedNotification.created_at)}
                </p>
                <h2 id="notification-detail-title" className="text-lg font-bold text-slate-900 mt-1 leading-snug">
                  {selectedNotification.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedNotification(null)}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {selectedNotification.message}
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              {(() => {
                const dest = resolveNotificationDestination(selectedNotification.link_path);
                if (!dest) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNotification(null);
                      handleNavigate(dest.tab, dest.videoId);
                    }}
                    className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <span>{dest.label}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Fixed 5-Destination Mobile Bottom Navigation Bar with Centered Circular Submit Button */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-end pb-1.5 px-1">
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            aria-current={activeTab === 'dashboard' ? 'page' : undefined}
            className={`relative min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'dashboard' ? 'text-[#2563EB]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Home className={`w-5 h-5 ${activeTab === 'dashboard' ? 'fill-blue-100' : ''}`} />
            <span className={`text-[11px] leading-none ${activeTab === 'dashboard' ? 'font-bold' : 'font-medium'}`}>
              Home
            </span>
            {activeTab === 'dashboard' && (
              <span className="absolute -bottom-1.5 w-9 h-[3px] rounded-full bg-[#2563EB]" />
            )}
          </button>

          {/* 2. Campaigns */}
          <button
            type="button"
            onClick={() => handleNavigate('campaigns')}
            aria-current={activeTab === 'campaigns' ? 'page' : undefined}
            className={`relative min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'campaigns' ? 'text-[#2563EB]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Megaphone className={`w-5 h-5 ${activeTab === 'campaigns' ? 'fill-blue-100' : ''}`} />
            <span className={`text-[11px] leading-none ${activeTab === 'campaigns' ? 'font-bold' : 'font-medium'}`}>
              Campaigns
            </span>
            {activeTab === 'campaigns' && (
              <span className="absolute -bottom-1.5 w-9 h-[3px] rounded-full bg-[#2563EB]" />
            )}
          </button>

          {/* 3. Submit (Prominent Centered Circular Royal Blue Button) */}
          <button
            type="button"
            onClick={() => handleNavigate('submit')}
            aria-current={activeTab === 'submit' ? 'page' : undefined}
            aria-label="Submit a YouTube Video"
            className="min-h-[48px] flex flex-col items-center justify-end gap-1 group"
          >
            <span
              className={`-mt-6 w-13 h-13 rounded-full bg-[#2563EB] group-hover:bg-[#1D4ED8] group-active:scale-95 text-white flex items-center justify-center shadow-lg shadow-blue-600/35 transition-all ${
                activeTab === 'submit' ? 'ring-4 ring-blue-100 bg-[#1D4ED8]' : 'ring-4 ring-white'
              }`}
            >
              <Plus className="w-6 h-6 stroke-[2.6]" />
            </span>
            <span
              className={`text-[11px] leading-none ${
                activeTab === 'submit' ? 'text-[#2563EB] font-bold' : 'text-slate-500 font-medium'
              }`}
            >
              Submit
            </span>
          </button>

          {/* 4. Reports */}
          <button
            type="button"
            onClick={() => handleNavigate('reports')}
            aria-current={activeTab === 'reports' ? 'page' : undefined}
            className={`relative min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'reports' ? 'text-[#2563EB]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            <span className={`text-[11px] leading-none ${activeTab === 'reports' ? 'font-bold' : 'font-medium'}`}>
              Reports
            </span>
            {activeTab === 'reports' && (
              <span className="absolute -bottom-1.5 w-9 h-[3px] rounded-full bg-[#2563EB]" />
            )}
          </button>

          {/* 5. Profile */}
          <button
            type="button"
            onClick={() => handleNavigate('profile')}
            aria-current={activeTab === 'profile' ? 'page' : undefined}
            className={`relative min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'profile' ? 'text-[#2563EB]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className={`w-5 h-5 ${activeTab === 'profile' ? 'fill-blue-100' : ''}`} />
            <span className={`text-[11px] leading-none ${activeTab === 'profile' ? 'font-bold' : 'font-medium'}`}>
              Profile
            </span>
            {activeTab === 'profile' && (
              <span className="absolute -bottom-1.5 w-9 h-[3px] rounded-full bg-[#2563EB]" />
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  BarChart3,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Crown,
  Home,
  LineChart,
  LogOut,
  Megaphone,
  Plus,
  PlusCircle,
  Rocket,
  Shield,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { AdminConsoleView } from './components/AdminConsoleView';
import { AuthViews } from './components/AuthViews';
import { VantageLogo } from './components/BrandMark';
import { CampaignsView } from './components/CampaignsView';
import { CustomerDashboard } from './components/CustomerDashboard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PackagesAndCheckoutView } from './components/PackagesAndCheckoutView';
import { ProfileView } from './components/ProfileView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReportsView } from './components/ReportsView';
import { SeoAndCompetitorsView } from './components/SeoAndCompetitorsView';
import { SubmitVideoView } from './components/SubmitVideoView';
import { VideoIntelligenceView } from './components/VideoIntelligenceView';
import { usePWAInstall } from './hooks/usePWAInstall';
import { api, formatDate, onUnauthorized, setAuthToken } from './lib/api';
import { initVisitorTracker, trackScreenView } from './lib/visitorTracker';
import type { NotificationRecord, UserSession } from './types';

type NavTab =
  | 'dashboard'
  | 'submit'
  | 'intelligence'
  | 'seo'
  | 'plans'
  | 'campaigns'
  | 'reports'
  | 'profile'
  | 'admin';

function getInitials(fullName: string, email: string): string {
  const source = (fullName || email.split('@')[0] || 'VR').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [paymentBanner, setPaymentBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentSyncSeq, setPaymentSyncSeq] = useState(0);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get<{ notifications: NotificationRecord[] }>('/api/notifications');
      setNotifications(res.notifications || []);
    } catch {
      // Ignore notification background fetch errors
    }
  }, []);

  const refreshMe = async () => {
    try {
      const res = await api.get<{ user: UserSession }>('/api/auth/me');
      setUser(res.user);
      fetchNotifications();
    } catch {
      setAuthToken(null);
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  const { updateState } = usePWAInstall();
  const isAuthedRef = useRef(false);
  isAuthedRef.current = Boolean(user);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as NavTab | null;
    if (
      tabParam &&
      ['dashboard', 'submit', 'intelligence', 'seo', 'plans', 'campaigns', 'reports', 'profile', 'admin'].includes(
        tabParam
      )
    ) {
      setActiveTab(tabParam);
    }

    initVisitorTracker();
    refreshMe();
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      setActiveTab('dashboard');
      setSelectedVideoId(null);
      setNotifications([]);
    });
    const handleAppSync = () => {
      if (isAuthedRef.current) {
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
    if (!user) return;
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
      trackScreenView(`/${activeTab}`, `Vantage Reach · ${activeTab}`);
    }
  }, [activeTab, user?.id]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleNavigate = (tab: string, videoId?: number) => {
    if (videoId) setSelectedVideoId(videoId);
    setActiveTab(tab as NavTab);
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
  };

  const markAllNotificationsRead = async () => {
    try {
      await api.post('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {
      // Ignore
    }
  };

  const handleNotificationClick = async (n: NotificationRecord) => {
    if (n.is_read === 0) {
      try {
        await api.post(`/api/notifications/${n.id}/read`);
        setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item)));
      } catch {
        // Ignore
      }
    }
    if (n.link_path?.includes('submit')) handleNavigate('submit');
    else if (n.link_path?.includes('campaign')) handleNavigate('campaigns');
    else if (n.link_path?.includes('video')) handleNavigate('intelligence');
    else if (n.link_path?.includes('profile')) handleNavigate('profile');
    else setNotifOpen(false);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <VantageLogo size={44} />
          <p className="text-xs font-semibold text-slate-500">Loading Vantage Reach...</p>
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
            setActiveTab('dashboard');
            fetchNotifications();
          }}
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
    { id: 'submit', label: 'Submit Video', icon: PlusCircle },
    { id: 'intelligence', label: 'Video Intelligence', icon: LineChart },
    { id: 'seo', label: 'SEO & Competitors', icon: Sparkles },
    { id: 'plans', label: 'Plans & Services', icon: Crown },
    { id: 'campaigns', label: 'My Campaigns', icon: Rocket },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'profile', label: 'Profile & Settings', icon: User },
  ];

  if (user.isAdmin) {
    sidebarItems.push({ id: 'admin', label: 'Admin Console', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-white lg:bg-slate-50 text-slate-900 flex flex-col lg:flex-row relative overflow-x-clip">
      <OfflineIndicator />

      {updateState === 'updating' && (
        <div
          role="status"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-[#1D4ED8] shadow-md whitespace-nowrap"
        >
          <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-ping" />
          <span>Syncing latest Vantage Reach update...</span>
        </div>
      )}

      {/* Subtle Top-Right Decorative Wash matching Mobile Dashboard Reference */}
      {(activeTab === 'dashboard' ||
        activeTab === 'campaigns' ||
        activeTab === 'submit' ||
        activeTab === 'intelligence') && (
        <div
          aria-hidden="true"
          className="lg:hidden pointer-events-none absolute top-0 right-0 w-64 h-64 rounded-full bg-blue-50/85 blur-2xl -translate-y-14 translate-x-14"
        />
      )}

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-100">
          <VantageLogo size={34} />
          <span className="text-base font-extrabold text-slate-900 font-display tracking-tight whitespace-nowrap">
            Vantage Reach
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
          <div className="text-xs text-slate-500 truncate">
            Signed in as <strong className="text-slate-800">{user.fullName || user.email}</strong>
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
            aria-label="Vantage Reach Home"
          >
            <VantageLogo size={34} />
            <span className="flex flex-col text-[15px] font-extrabold text-slate-900 font-display leading-[1.05] tracking-tight">
              <span>Vantage</span>
              <span>Reach</span>
            </span>
          </button>

          {/* Desktop Breadcrumb */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-medium text-slate-500">
            <span>Vantage Talent Search Global</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-900 font-semibold">
              {sidebarItems.find((i) => i.id === activeTab)?.label || 'Dashboard'}
            </span>
          </div>

          {/* Top Right Controls: Install App + Admin + Notifications Bell + Profile Avatar */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            <div className="lg:hidden">
              <PWAInstallButton compact />
            </div>

            {user.isAdmin && (
              <button
                type="button"
                onClick={() => handleNavigate(activeTab === 'admin' ? 'dashboard' : 'admin')}
                aria-current={activeTab === 'admin' ? 'page' : undefined}
                aria-label={activeTab === 'admin' ? 'Exit Admin Console' : 'Open Admin Console'}
                className={`inline-flex min-h-[40px] px-2.5 sm:px-3 rounded-xl border text-xs font-semibold items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === 'admin'
                    ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-sm'
                    : 'border-blue-200 bg-blue-50/90 text-[#1D4ED8] hover:bg-blue-100'
                }`}
              >
                <Shield className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'admin' ? 'text-white' : 'text-[#2563EB]'}`} />
                <span>Admin</span>
              </button>
            )}

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
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-slate-200 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-xs font-semibold text-[#2563EB] hover:underline inline-flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-5 text-xs text-slate-500 text-center">No notifications yet.</p>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                            n.is_read === 0 ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-900 truncate">{n.title}</p>
                            <span className="text-[11px] text-slate-400 shrink-0">{formatDate(n.created_at)}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
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
                    onClick={() => handleNavigate('intelligence')}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <LineChart className="w-4 h-4 text-slate-400" />
                    <span>Video Intelligence</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate('seo')}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <Sparkles className="w-4 h-4 text-slate-400" />
                    <span>SEO & Competitors</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate('plans')}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <Crown className="w-4 h-4 text-slate-400" />
                    <span>Plans & Services</span>
                  </button>
                  {user.isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleNavigate('admin')}
                      className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#2563EB] hover:bg-blue-50 flex items-center gap-2.5"
                    >
                      <Shield className="w-4 h-4 text-[#2563EB]" />
                      <span>Admin Console</span>
                    </button>
                  )}
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
                setActiveTab('intelligence');
              }}
            />
          )}
          {activeTab === 'intelligence' && (
            <VideoIntelligenceView
              selectedVideoId={selectedVideoId}
              onSelectVideo={setSelectedVideoId}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'seo' && (
            <SeoAndCompetitorsView
              key={`seo-${paymentSyncSeq}`}
              selectedVideoId={selectedVideoId}
              onSelectVideo={setSelectedVideoId}
              onNavigate={handleNavigate}
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
              onOpenAdmin={user.isAdmin ? () => handleNavigate('admin') : undefined}
            />
          )}
          {activeTab === 'admin' && <AdminConsoleView user={user} onNavigate={handleNavigate} />}
        </main>
      </div>

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

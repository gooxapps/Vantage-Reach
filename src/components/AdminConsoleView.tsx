import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  KeyRound,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  Palette,
  Plus,
  Rocket,
  Shield,
  Sparkles,
  UserCog,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api, formatCount, formatCurrency, formatDateTime, formatStatusLabel, setAuthToken } from '../lib/api';
import { useSiteConfig } from '../lib/siteConfig';
import type { UserSession } from '../types';
import { AdminSiteSettingsPanel } from './AdminSiteSettingsPanel';
import { AdminVisitorsPanel } from './AdminVisitorsPanel';
import { VantageLogo } from './BrandMark';

type AdminModule =
  | 'overview'
  | 'visitors'
  | 'customers'
  | 'videos'
  | 'campaigns'
  | 'tasks'
  | 'seo_orders'
  | 'payments'
  | 'reports'
  | 'pricing'
  | 'notifications'
  | 'branding'
  | 'gemini'
  | 'youtube'
  | 'staff'
  | 'permissions'
  | 'audit';

type AdminGroup = 'Operations' | 'Billing & Messaging' | 'Site & Access';

const MODULES: Array<{
  id: AdminModule;
  label: string;
  group: AdminGroup;
  permissions: string[];
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', group: 'Operations', permissions: ['overview:read'], icon: BarChart3 },
  { id: 'visitors', label: 'Site Visitors', group: 'Operations', permissions: ['visitors:read'], icon: Eye },
  { id: 'customers', label: 'Customers', group: 'Operations', permissions: ['customers:manage'], icon: Users },
  {
    id: 'videos',
    label: 'Video Submissions',
    group: 'Operations',
    permissions: ['videos:read', 'videos:manage'],
    icon: Video,
  },
  { id: 'campaigns', label: 'Campaigns', group: 'Operations', permissions: ['campaigns:manage'], icon: Rocket },
  { id: 'tasks', label: 'Promotion Tasks', group: 'Operations', permissions: ['tasks:manage'], icon: ListChecks },
  { id: 'payments', label: 'Payments', group: 'Billing & Messaging', permissions: ['payments:manage'], icon: CreditCard },
  {
    id: 'reports',
    label: 'Reports',
    group: 'Billing & Messaging',
    permissions: ['reports:read', 'reports:manage'],
    icon: FileText,
  },
  { id: 'pricing', label: 'Pricing & Plans', group: 'Billing & Messaging', permissions: ['pricing:manage'], icon: DollarSign },
  {
    id: 'notifications',
    label: 'Notifications',
    group: 'Billing & Messaging',
    permissions: ['notifications:manage'],
    icon: Bell,
  },
  {
    id: 'branding',
    label: 'Site & Branding',
    group: 'Site & Access',
    permissions: ['settings:site'],
    icon: Palette,
  },
  {
    id: 'youtube',
    label: 'Flutterwave & APIs',
    group: 'Site & Access',
    permissions: ['settings:youtube', 'payments:manage'],
    icon: KeyRound,
  },
  { id: 'staff', label: 'Owner & Staff', group: 'Site & Access', permissions: ['staff:manage'], icon: UserCog },
  { id: 'permissions', label: 'Permissions', group: 'Site & Access', permissions: ['roles:manage'], icon: Shield },
  { id: 'audit', label: 'Audit Logs', group: 'Site & Access', permissions: ['audit:read'], icon: Activity },
];

const MODULE_GROUPS: AdminGroup[] = ['Operations', 'Billing & Messaging', 'Site & Access'];

export const AdminConsoleView: React.FC<{
  user: UserSession;
  onLogout: () => void;
  onUserUpdated?: () => void;
  updateState?: string;
}> = ({ user, onLogout, onUserUpdated, updateState }) => {
  const { siteConfig } = useSiteConfig();
  const visibleModules = MODULES.filter((m) => {
    if (user.adminRole === 'super_admin' || !user.permissions || user.permissions.length === 0) return true;
    return m.permissions.some((perm) => user.permissions.includes(perm));
  });

  const [activeMod, setActiveMod] = useState<AdminModule>(visibleModules[0]?.id || 'overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Inline forms
  const [taskCampaignId, setTaskCampaignId] = useState('');
  const [taskSummary, setTaskSummary] = useState('');
  const [taskDetails, setTaskDetails] = useState('');

  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifTargetUserId, setNotifTargetUserId] = useState('');
  const [notifLinkPath, setNotifLinkPath] = useState('/');

  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgKind, setNewPkgKind] = useState<'promotion' | 'seo_service'>('promotion');
  const [newPkgDesc, setNewPkgDesc] = useState('');
  const [newPkgUsd, setNewPkgUsd] = useState('19.99');
  const [newPkgNgn, setNewPkgNgn] = useState('30000');
  const [newPkgDays, setNewPkgDays] = useState('7');
  const [newPkgDeliverables, setNewPkgDeliverables] = useState('');

  const [ownerEmail, setOwnerEmail] = useState(user.email);
  const [ownerName, setOwnerName] = useState(user.fullName || '');
  const [ownerCurrentPassword, setOwnerCurrentPassword] = useState('');
  const [ownerNewPassword, setOwnerNewPassword] = useState('');

  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRoleId, setStaffRoleId] = useState('2');
  const [staffTitle, setStaffTitle] = useState('Campaign Manager');

  const [geminiModel, setGeminiModel] = useState('gemini-4-hydrogen');
  const [geminiMaxComp, setGeminiMaxComp] = useState('8');
  const [ytApiKey, setYtApiKey] = useState('');
  const [ytRegion, setYtRegion] = useState('US');
  const [defaultProvider, setDefaultProvider] = useState('flutterwave');
  const [flwPublicKey, setFlwPublicKey] = useState('');
  const [flwSecretKey, setFlwSecretKey] = useState('');
  const [flwEncryptionKey, setFlwEncryptionKey] = useState('');
  const [flwWebhookHash, setFlwWebhookHash] = useState('');
  const [flwConnected, setFlwConnected] = useState(false);
  const [testingFlw, setTestingFlw] = useState(false);

  const loadModule = async (mod: AdminModule) => {
    if (mod === 'visitors' || mod === 'branding') {
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mod === 'overview') {
        const res = await api.get<any>('/api/admin/overview');
        setData((p) => ({ ...p, overview: res.overview }));
      } else if (mod === 'customers') {
        const res = await api.get<any>('/api/admin/customers');
        setData((p) => ({ ...p, customers: res.customers }));
      } else if (mod === 'videos') {
        const res = await api.get<any>('/api/admin/videos');
        setData((p) => ({ ...p, videos: res.videos }));
      } else if (mod === 'campaigns') {
        const res = await api.get<any>('/api/admin/campaigns');
        setData((p) => ({ ...p, campaigns: res.campaigns }));
      } else if (mod === 'tasks') {
        const [tRes, cRes] = await Promise.all([
          api.get<any>('/api/admin/tasks'),
          api.get<any>('/api/admin/campaigns'),
        ]);
        setData((p) => ({ ...p, tasks: tRes.tasks, campaigns: cRes.campaigns }));
        if (!taskCampaignId && cRes.campaigns[0]) setTaskCampaignId(String(cRes.campaigns[0].id));
      } else if (mod === 'seo_orders') {
        const res = await api.get<any>('/api/admin/seo-orders');
        setData((p) => ({ ...p, seoOrders: res.orders }));
      } else if (mod === 'payments') {
        const res = await api.get<any>('/api/admin/payments');
        setData((p) => ({ ...p, payments: res.payments }));
      } else if (mod === 'reports') {
        const res = await api.get<any>('/api/admin/reports');
        setData((p) => ({ ...p, reports: res.reports }));
      } else if (mod === 'pricing') {
        const res = await api.get<any>('/api/admin/packages');
        setData((p) => ({ ...p, packages: res.packages }));
      } else if (mod === 'notifications') {
        const res = await api.get<any>('/api/admin/notifications');
        setData((p) => ({ ...p, notifHistory: res.recent, notifCustomers: res.customers }));
      } else if (mod === 'gemini' || mod === 'youtube') {
        const [res, gwRes] = await Promise.all([
          api.get<{ settings: Array<{ key: string; value: string; hasValue: boolean }> }>('/api/admin/settings'),
          api
            .get<{ status?: { flutterwaveConfigured?: boolean } }>('/api/admin/payment-gateways')
            .catch(() => ({ status: { flutterwaveConfigured: false } })),
        ]);
        setData((p) => ({ ...p, settings: res.settings }));
        const map = new Map(res.settings.map((s) => [s.key, s.value]));
        setGeminiModel(map.get('gemini_model') || 'gemini-4-hydrogen');
        setGeminiMaxComp(map.get('gemini_max_competitors') || '8');
        setYtApiKey(map.get('youtube_api_key') || '');
        setYtRegion(map.get('youtube_default_region') || 'US');
        setDefaultProvider(map.get('payment_default_provider') || 'flutterwave');
        setFlwPublicKey(map.get('flutterwave_public_key') || '');
        setFlwSecretKey(map.get('flutterwave_secret_key') || '');
        setFlwEncryptionKey(map.get('flutterwave_encryption_key') || '');
        setFlwWebhookHash(map.get('flutterwave_webhook_hash') || '');
        setFlwConnected(Boolean(gwRes.status?.flutterwaveConfigured));
      } else if (mod === 'staff') {
        const [sRes, rRes] = await Promise.all([
          api.get<any>('/api/admin/staff'),
          api.get<any>('/api/admin/roles'),
        ]);
        setData((p) => ({ ...p, staff: sRes.staff, roles: rRes.roles }));
      } else if (mod === 'permissions') {
        const rRes = await api.get<any>('/api/admin/roles');
        setData((p) => ({ ...p, roles: rRes.roles }));
      } else if (mod === 'audit') {
        const res = await api.get<any>('/api/admin/audit-logs');
        setData((p) => ({ ...p, auditLogs: res.logs }));
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load admin module.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModule(activeMod);
  }, [activeMod]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!user.isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Administrator authorization required.
        </div>
      </div>
    );
  }

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const selectModule = (modId: AdminModule) => {
    setError('');
    setActiveMod(modId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeModuleMeta = visibleModules.find((m) => m.id === activeMod) || visibleModules[0] || MODULES[0];

  const renderMenuItems = () => (
    <div className="space-y-5">
      {MODULE_GROUPS.map((group) => {
        const groupItems = visibleModules.filter((m) => m.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold text-slate-400">{group}</p>
            {groupItems.map((m) => {
              const Icon = m.icon;
              const active = activeMod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectModule(m.id)}
                  className={`w-full min-h-[42px] px-3 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-[#2563EB] font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#2563EB]' : 'text-slate-400'}`} />
                  <span className="truncate">{m.label}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row overflow-x-clip">
      {updateState === 'updating' && (
        <div
          role="status"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-[#1D4ED8] shadow-md whitespace-nowrap"
        >
          <span>Syncing latest update...</span>
        </div>
      )}

      {/* Desktop Admin-Only Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-100 shrink-0">
          <VantageLogo size={32} logoUrl={siteConfig.logoUrl} alt={siteConfig.appName} accentColor={siteConfig.themeColor} />
          <span className="text-base font-extrabold text-slate-900 font-display tracking-tight truncate">
            {siteConfig.appName}
          </span>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto" aria-label="Admin Navigation">
          {renderMenuItems()}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2.5 shrink-0">
          <div className="text-xs text-slate-500">
            <p className="font-semibold text-slate-900 truncate">{user.fullName || user.email}</p>
            <p className="truncate mt-0.5">
              {user.adminRole === 'super_admin' ? 'Platform Owner (Super Admin)' : formatStatusLabel(user.adminRole || 'admin')}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-xs font-semibold text-red-600 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Admin Menu Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close Admin Menu"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 flex flex-col z-10 shadow-xl">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <VantageLogo size={30} logoUrl={siteConfig.logoUrl} alt={siteConfig.appName} accentColor={siteConfig.themeColor} />
                <span className="text-sm font-extrabold text-slate-900 font-display tracking-tight whitespace-nowrap">
                  Owner &amp; Admin Menu
                </span>
              </div>
              <button
                type="button"
                aria-label="Close Menu"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 overflow-y-auto" aria-label="Mobile Admin Navigation">
              {renderMenuItems()}
            </nav>
            <div className="p-4 border-t border-slate-100 space-y-2.5 shrink-0">
              <div className="text-xs text-slate-500">
                <p className="font-semibold text-slate-900 truncate">{user.fullName || user.email}</p>
                <p className="truncate mt-0.5">
                  {user.adminRole === 'super_admin' ? 'Platform Owner (Super Admin)' : formatStatusLabel(user.adminRole || 'admin')}
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-red-50 text-xs font-semibold text-red-600 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Dedicated Admin Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 lg:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3.5 sm:px-6 flex items-center justify-between gap-3 pt-safe">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Admin Menu"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-1.5 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 min-w-0">
              <span className="font-semibold text-slate-900 whitespace-nowrap">{siteConfig.appName} Admin</span>
              <span aria-hidden="true">·</span>
              <span className="truncate text-[#2563EB] font-semibold">{activeModuleMeta.label}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Sign Out</span>
          </button>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 lg:py-6 space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {siteConfig.companyName} ·{' '}
              {user.adminRole === 'super_admin' ? 'Platform Owner Console' : formatStatusLabel(user.adminRole || 'admin')}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">{activeModuleMeta.label}</h1>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
              {notice}
            </div>
          )}

          {loading && <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />}

          {!loading && activeMod === 'overview' && data.overview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <button
                  type="button"
                  onClick={() => selectModule('visitors')}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 p-4 text-left transition-colors"
                >
                  <p className="text-xs font-semibold text-emerald-700">Online Now</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {formatCount(data.overview.activeVisitorsNow ?? 0)}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => selectModule('visitors')}
                  className="rounded-2xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 p-4 text-left transition-colors"
                >
                  <p className="text-xs font-semibold text-[#2563EB]">Visitors (24h)</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {formatCount(data.overview.todayVisitors ?? 0)}
                  </p>
                </button>

            {[
              { label: 'Customers', value: formatCount(data.overview.customers) },
              { label: 'Submitted Videos', value: formatCount(data.overview.videos) },
              { label: 'Active Campaigns', value: formatCount(data.overview.activeCampaigns) },
              { label: 'Pending Reviews', value: formatCount(data.overview.pendingReviews) },
              { label: 'Total Campaigns', value: formatCount(data.overview.campaigns) },
              { label: 'SEO Orders', value: formatCount(data.overview.seoOrders) },
              { label: 'Verified USD', value: formatCurrency(data.overview.verifiedRevenueUsd, 'USD') },
              { label: 'Verified NGN', value: formatCurrency(data.overview.verifiedRevenueNgn, 'NGN') },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && activeMod === 'visitors' && <AdminVisitorsPanel />}

      {!loading && activeMod === 'customers' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Name / Country</th>
                <th className="py-2 pr-4 text-right">Videos</th>
                <th className="py-2 pr-4 text-right">Campaigns</th>
                <th className="py-2 pr-4 text-right">Spent</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.customers || []).map((c: any) => (
                <tr key={c.id}>
                  <td className="py-3 pr-4 font-semibold text-slate-900">{c.email}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    {c.full_name || '—'} · {c.country}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{c.video_count}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{c.campaign_count}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">
                    {formatCurrency(c.total_spent, 'USD')}
                  </td>
                  <td className="py-3 pr-4 font-semibold">{formatStatusLabel(c.status)}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={async () => {
                        await api.patch(`/api/admin/customers/${c.id}/status`, {
                          status: c.status === 'active' ? 'suspended' : 'active',
                        });
                        flash(`Updated customer ${c.email}`);
                        loadModule('customers');
                      }}
                      className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold"
                    >
                      {c.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeMod === 'videos' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Video &amp; Links</th>
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.videos || []).map((v: any) => (
                <tr key={v.id}>
                  <td className="py-3 pr-4 max-w-xs">
                    <p className="font-semibold text-slate-900 truncate">{v.title}</p>
                    {typeof v.url === 'string' &&
                      v.url.startsWith('https://') &&
                      !String(v.youtube_video_id || '').startsWith('ch:') &&
                      v.url !== v.channel_url && (
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-blue-700 hover:underline truncate block mt-0.5"
                        >
                          {v.url}
                        </a>
                      )}
                  </td>
                  <td className="py-3 pr-4 max-w-xs">
                    {typeof v.channel_url === 'string' && v.channel_url.startsWith('https://') ? (
                      <a
                        href={v.channel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 hover:underline font-medium truncate block"
                      >
                        {v.channel_url}
                      </a>
                    ) : (
                      <span className="text-slate-600">{v.channel_name || '—'}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{v.owner_email}</td>
                  <td className="py-3 text-slate-500 whitespace-nowrap">{formatDateTime(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeMod === 'campaigns' && (
        <div className="space-y-3">
          {(data.campaigns || []).map((c: any) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-mono text-slate-500">
                  {c.campaign_ref} · {c.customer_email} · {c.duration_days}d · Payment: {formatStatusLabel(c.payment_status)}
                </p>
                <p className="text-sm font-bold text-slate-900 truncate">{c.video_title || c.title}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                  {typeof c.video_url === 'string' &&
                    c.video_url.startsWith('https://') &&
                    !String(c.youtube_video_id || '').startsWith('ch:') &&
                    c.video_url !== c.channel_url && (
                      <a
                        href={c.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 hover:underline font-medium truncate max-w-xs"
                      >
                        Video: {c.video_url}
                      </a>
                    )}
                  {typeof c.channel_url === 'string' && c.channel_url.startsWith('https://') && (
                    <a
                      href={c.channel_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:underline font-medium truncate max-w-xs"
                    >
                      Channel: {c.channel_url}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Status for ${c.campaign_ref}`}
                  value={c.status}
                  onChange={async (e) => {
                    await api.patch(`/api/admin/campaigns/${c.id}`, { status: e.target.value });
                    flash(`Updated ${c.campaign_ref} status`);
                    loadModule('campaigns');
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold"
                >
                  {[
                    'awaiting_payment',
                    'under_review',
                    'approved',
                    'scheduled',
                    'in_progress',
                    'completed',
                    'rejected',
                    'cancelled',
                  ].map((st) => (
                    <option key={st} value={st}>
                      {formatStatusLabel(st)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    await api.post(`/api/admin/campaigns/${c.id}/report`, {});
                    flash(`Completion report published for ${c.campaign_ref}`);
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 whitespace-nowrap"
                >
                  Publish Report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && activeMod === 'tasks' && (
        <div className="space-y-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!taskCampaignId) return;
              await api.post(`/api/admin/campaigns/${taskCampaignId}/activities`, {
                activityType: 'promotion_task',
                summary: taskSummary,
                details: taskDetails,
              });
              setTaskSummary('');
              setTaskDetails('');
              flash('Promotion task logged to campaign activity timeline.');
              loadModule('tasks');
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900">Log Promotion Activity Task</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={taskCampaignId}
                onChange={(e) => setTaskCampaignId(e.target.value)}
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              >
                {(data.campaigns || []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_ref} — {c.title}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={taskSummary}
                onChange={(e) => setTaskSummary(e.target.value)}
                placeholder="Task summary (e.g. Creator newsletter placement)"
                className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
              <input
                type="text"
                value={taskDetails}
                onChange={(e) => setTaskDetails(e.target.value)}
                placeholder="Notes / details"
                className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
            >
              Add Promotion Task
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {(data.tasks || []).map((t: any) => (
              <div key={t.id} className="p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <strong className="text-slate-900">{t.summary}</strong> ·{' '}
                  <span className="font-mono text-slate-500">{t.campaign_ref}</span>
                  {t.details && <p className="text-slate-600 mt-0.5">{t.details}</p>}
                </div>
                <span className="text-slate-400">{formatDateTime(t.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && activeMod === 'seo_orders' && (
        <div className="space-y-3">
          {(data.seoOrders || []).map((o: any) => (
            <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  {o.order_ref} · {o.customer_email} · Payment: {formatStatusLabel(o.payment_status)}
                </p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  {o.service_name} — {o.video_title}
                </p>
              </div>
              <select
                value={o.order_status}
                onChange={async (e) => {
                  await api.patch(`/api/admin/seo-orders/${o.id}`, { orderStatus: e.target.value });
                  flash(`Updated SEO order ${o.order_ref}`);
                  loadModule('seo_orders');
                }}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold"
              >
                {['awaiting_payment', 'queued', 'in_progress', 'delivered', 'cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {formatStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {!loading && activeMod === 'payments' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.payments || []).map((p: any) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4 font-mono text-slate-900">{p.tx_ref}</td>
                  <td className="py-3 pr-4 text-slate-600">{p.customer_email}</td>
                  <td className="py-3 pr-4 uppercase">{p.provider}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold">
                    {formatCurrency(p.amount, p.currency)}
                  </td>
                  <td className="py-3 pr-4 font-semibold">{formatStatusLabel(p.status)}</td>
                  <td className="py-3">
                    {p.status === 'verified' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await api.post(`/api/admin/payments/${p.id}/refund`, {
                            reason: 'Refunded by administrator',
                          });
                          flash(`Refund processed for ${p.tx_ref}`);
                          loadModule('payments');
                        }}
                        className="min-h-[36px] px-3 rounded-lg border border-red-200 bg-red-50 text-red-700 font-semibold"
                      >
                        Issue Refund
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeMod === 'reports' && (
        <div className="space-y-3">
          {(data.reports || []).length === 0 ? (
            <p className="text-xs text-slate-500 p-6 rounded-2xl border border-slate-200 bg-white">
              No published campaign completion reports yet. Publish one from the Campaigns module.
            </p>
          ) : (
            (data.reports || []).map((r: any) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <strong className="text-slate-900">
                    {r.campaign_ref} — {r.campaign_title}
                  </strong>
                  <span className="text-slate-400">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="text-slate-700">{r.summary}</p>
                <p className="text-slate-500">Customer: {r.customer_email}</p>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && activeMod === 'pricing' && (
        <div className="space-y-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.post('/api/admin/packages', {
                  kind: newPkgKind,
                  name: newPkgName,
                  description: newPkgDesc,
                  durationDays: Number(newPkgDays || 0),
                  priceUsd: Number(newPkgUsd || 0),
                  priceNgn: Number(newPkgNgn || 0),
                  deliverables: newPkgDeliverables
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  isActive: true,
                });
                setNewPkgName('');
                setNewPkgDesc('');
                setNewPkgDeliverables('');
                flash('New service package created.');
                loadModule('pricing');
              } catch (err: any) {
                setError(err?.message || 'Could not create package.');
              }
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-700" />
              <span>Create Promotion or SEO Package</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="text"
                required
                value={newPkgName}
                onChange={(e) => setNewPkgName(e.target.value)}
                placeholder="Package title"
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs lg:col-span-2"
              />
              <select
                value={newPkgKind}
                onChange={(e) => setNewPkgKind(e.target.value as 'promotion' | 'seo_service')}
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              >
                <option value="promotion">Promotion Plan</option>
                <option value="seo_service">SEO Service</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={newPkgUsd}
                onChange={(e) => setNewPkgUsd(e.target.value)}
                placeholder="Price USD"
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
              <input
                type="number"
                step="100"
                value={newPkgNgn}
                onChange={(e) => setNewPkgNgn(e.target.value)}
                placeholder="Price NGN"
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={newPkgDesc}
                onChange={(e) => setNewPkgDesc(e.target.value)}
                placeholder="Short package description"
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:col-span-2"
              />
              <input
                type="number"
                min={0}
                value={newPkgDays}
                onChange={(e) => setNewPkgDays(e.target.value)}
                placeholder="Duration days (0 for SEO)"
                className="min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
            </div>
            <textarea
              rows={2}
              value={newPkgDeliverables}
              onChange={(e) => setNewPkgDeliverables(e.target.value)}
              placeholder="Deliverables (one item per line)"
              className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
            />
            <button
              type="submit"
              className="min-h-[42px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
            >
              Add Package
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data.packages || []).map((pkg: any) => (
              <PackagePricingCard
                key={pkg.id}
                pkg={pkg}
                onSaved={() => {
                  flash(`Saved pricing for ${pkg.name}`);
                  loadModule('pricing');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && activeMod === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await api.post<{ ok: boolean; sentCount: number }>(
                  '/api/admin/notifications/broadcast',
                  {
                    title: notifTitle,
                    message: notifMessage,
                    targetUserId: notifTargetUserId ? Number(notifTargetUserId) : undefined,
                    linkPath: notifLinkPath || '/',
                  }
                );
                setNotifTitle('');
                setNotifMessage('');
                flash(`Notification pushed live to ${res.sentCount} account(s).`);
                loadModule('notifications');
              } catch (err: any) {
                setError(err?.message || 'Failed to send notification.');
              }
            }}
            className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">Push Customer Notification</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Recipient</label>
                <select
                  value={notifTargetUserId}
                  onChange={(e) => setNotifTargetUserId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                >
                  <option value="">All Active Accounts</option>
                  {(data.notifCustomers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name ? `${c.full_name} (${c.email})` : c.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Action Destination</label>
                <select
                  value={notifLinkPath}
                  onChange={(e) => setNotifLinkPath(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                >
                  <option value="/">Dashboard</option>
                  <option value="/submit">Submit Video</option>
                  <option value="/campaigns">My Campaigns</option>
                  <option value="/seo">SEO &amp; Competitors</option>
                  <option value="/plans">Plans &amp; Services</option>
                  <option value="/reports">Reports</option>
                  <option value="/profile">Profile &amp; Settings</option>
                </select>
              </div>
            </div>
            <input
              type="text"
              required
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
            <textarea
              required
              rows={3}
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              placeholder="Message to creators..."
              className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
            >
              Send Live Push Notification
            </button>
          </form>

          <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900">Recent Sent Notifications</h2>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {(data.notifHistory || []).length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No notifications dispatched yet.</p>
              ) : (
                (data.notifHistory || []).map((n: any) => (
                  <div key={n.id} className="py-3 text-xs space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-slate-900">{n.title}</strong>
                      <span className="text-slate-400 shrink-0 tabular-nums">{formatDateTime(n.created_at)}</span>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{n.message}</p>
                    <p className="text-[11px] text-slate-400">
                      To: {n.recipient_email} · {n.category} · {n.link_path}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && activeMod === 'branding' && (
        <AdminSiteSettingsPanel onFlash={flash} onError={setError} />
      )}

      {!loading && activeMod === 'gemini' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 max-w-xl space-y-4">
          <h2 className="text-base font-bold text-slate-900">Gemini SEO Configuration</h2>
          <p className="text-xs text-slate-500">
            Configure the active server-side Gemini model alias and prompt competitor context size. The Gemini API key is managed securely via server environment secrets.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Active Gemini Model</label>
            <select
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            >
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Recommended Flash)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Lite)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Max Competitors in Context</label>
            <input
              type="number"
              min={1}
              max={12}
              value={geminiMaxComp}
              onChange={(e) => setGeminiMaxComp(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              await api.put('/api/admin/settings', { key: 'gemini_model', value: geminiModel });
              await api.put('/api/admin/settings', { key: 'gemini_max_competitors', value: geminiMaxComp });
              flash('Gemini configuration saved.');
            }}
            className="min-h-[44px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
          >
            Save Gemini Settings
          </button>
        </div>
      )}

      {!loading && activeMod === 'youtube' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Flutterwave Gateway Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Flutterwave Payment Gateway</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect your Flutterwave v3 keys to accept live $1 VIP memberships and campaign payments.
                </p>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${
                  flwConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                }`}
              >
                {flwConnected ? 'Live Key Ready' : 'Not Connected'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Flutterwave Public Key</label>
              <input
                type="text"
                value={flwPublicKey}
                onChange={(e) => setFlwPublicKey(e.target.value)}
                placeholder="FLWPUBK-..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Flutterwave Secret Key (Required for Checkout &amp; Verification)
              </label>
              <input
                type="password"
                value={flwSecretKey}
                onChange={(e) => setFlwSecretKey(e.target.value)}
                placeholder="FLWSECK-..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Encryption Key</label>
                <input
                  type="password"
                  value={flwEncryptionKey}
                  onChange={(e) => setFlwEncryptionKey(e.target.value)}
                  placeholder="FLWSECK_TEST..."
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook Secret Hash</label>
                <input
                  type="password"
                  value={flwWebhookHash}
                  onChange={(e) => setFlwWebhookHash(e.target.value)}
                  placeholder="Optional verif-hash"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              Flutterwave Webhook URL:{' '}
              <code className="font-mono text-slate-900 break-all">
                {`${window.location.origin}/api/payments/webhook/flutterwave`}
              </code>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  setError('');
                  try {
                    await api.put('/api/admin/settings', { key: 'flutterwave_public_key', value: flwPublicKey });
                    await api.put('/api/admin/settings', { key: 'flutterwave_secret_key', value: flwSecretKey });
                    await api.put('/api/admin/settings', {
                      key: 'flutterwave_encryption_key',
                      value: flwEncryptionKey,
                    });
                    await api.put('/api/admin/settings', { key: 'flutterwave_webhook_hash', value: flwWebhookHash });
                    await api.put('/api/admin/settings', { key: 'payment_default_provider', value: defaultProvider });
                    flash('Flutterwave keys saved securely on the server.');
                    loadModule('youtube');
                  } catch (err: any) {
                    setError(err?.message || 'Unable to save Flutterwave settings.');
                  }
                }}
                className="min-h-[44px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
              >
                Save Flutterwave Keys
              </button>

              <button
                type="button"
                disabled={testingFlw}
                onClick={async () => {
                  setError('');
                  setTestingFlw(true);
                  try {
                    const res = await api.post<{ message: string }>('/api/admin/flutterwave/test');
                    setFlwConnected(true);
                    flash(res.message || 'Connected to Flutterwave!');
                  } catch (err: any) {
                    setError(err?.message || 'Flutterwave connection test failed.');
                  } finally {
                    setTestingFlw(false);
                  }
                }}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                {testingFlw ? 'Testing...' : 'Test Flutterwave Connection'}
              </button>
            </div>
          </div>

          {/* YouTube API & Default Provider Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 h-fit">
            <h2 className="text-base font-bold text-slate-900">YouTube Data API v3 &amp; Default Gateway</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                YouTube Data API v3 Key (Server Override)
              </label>
              <input
                type="password"
                value={ytApiKey}
                onChange={(e) => setYtApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default Search Region</label>
                <input
                  type="text"
                  value={ytRegion}
                  onChange={(e) => setYtRegion(e.target.value.toUpperCase())}
                  maxLength={2}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default Payment Provider</label>
                <select
                  value={defaultProvider}
                  onChange={(e) => setDefaultProvider(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                >
                  <option value="flutterwave">Flutterwave</option>
                  <option value="paystack">Paystack</option>
                  <option value="sandbox">Test Gateway</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await api.put('/api/admin/settings', { key: 'youtube_api_key', value: ytApiKey });
                await api.put('/api/admin/settings', { key: 'youtube_default_region', value: ytRegion });
                await api.put('/api/admin/settings', { key: 'payment_default_provider', value: defaultProvider });
                flash('YouTube API & default gateway configuration saved.');
              }}
              className="min-h-[44px] px-5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              Save API Configuration
            </button>
          </div>
        </div>
      )}

      {!loading && activeMod === 'staff' && (
        <div className="space-y-5">
          {user.adminRole === 'super_admin' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                try {
                  const res = await api.put<{ ok: boolean; sessionToken?: string }>(
                    '/api/admin/owner-account',
                    {
                      email: ownerEmail,
                      fullName: ownerName,
                      currentPassword: ownerCurrentPassword,
                      newPassword: ownerNewPassword || undefined,
                    }
                  );
                  if (res.sessionToken) setAuthToken(res.sessionToken);
                  setOwnerCurrentPassword('');
                  setOwnerNewPassword('');
                  flash('Owner credentials updated.');
                  onUserUpdated?.();
                  loadModule('staff');
                } catch (err: any) {
                  setError(err?.message || 'Unable to update owner credentials.');
                }
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900">Platform Owner Credentials</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update your own Owner email, display name, or password (enter current password to confirm email/password changes).
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="Owner email"
                  className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                />
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Owner full name"
                  className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                />
                <input
                  type="password"
                  value={ownerCurrentPassword}
                  onChange={(e) => setOwnerCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                />
                <input
                  type="password"
                  minLength={8}
                  value={ownerNewPassword}
                  onChange={(e) => setOwnerNewPassword(e.target.value)}
                  placeholder="New password (optional)"
                  className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Update Owner Account
              </button>
            </form>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                await api.post('/api/admin/staff', {
                  email: staffEmail,
                  fullName: staffName,
                  password: staffPassword,
                  roleId: Number(staffRoleId),
                  staffTitle,
                });
                setStaffEmail('');
                setStaffName('');
                setStaffPassword('');
                flash('Staff / owner account assigned.');
                loadModule('staff');
              } catch (err: any) {
                setError(err?.message || 'Unable to save staff account.');
              }
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900">Add or Promote Staff Account</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="email"
                required
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="staff@vantagereach.global"
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Full name"
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
              <input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Password (new users)"
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
              <select
                value={staffRoleId}
                onChange={(e) => setStaffRoleId(e.target.value)}
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              >
                {(data.roles || []).map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {formatStatusLabel(r.name)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={staffTitle}
                onChange={(e) => setStaffTitle(e.target.value)}
                placeholder="Staff title"
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
            >
              Save Staff Account
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {(data.staff || []).map((s: any) => (
              <div key={s.id} className="p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <strong className="text-slate-900">{s.full_name || s.email}</strong> ({s.email})
                  <p className="text-slate-500 mt-0.5">
                    {s.staff_title} · Role: <strong>{formatStatusLabel(s.role_name)}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await api.patch(`/api/admin/staff/${s.id}`, { isActive: !s.is_active });
                    flash('Updated staff account status.');
                    loadModule('staff');
                  }}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
                >
                  {s.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && activeMod === 'permissions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data.roles || []).map((r: any) => (
            <RolePermissionEditor
              key={r.id}
              role={r}
              onSaved={() => {
                flash(`Updated permissions for ${r.name}`);
                loadModule('permissions');
              }}
            />
          ))}
        </div>
      )}

      {!loading && activeMod === 'audit' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Timestamp</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.auditLogs || []).map((l: any) => (
                <tr key={l.id}>
                  <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                  <td className="py-2.5 pr-4 font-medium text-slate-900">{l.actor_email || 'system'}</td>
                  <td className="py-2.5 pr-4 font-mono text-blue-700">{l.action}</td>
                  <td className="py-2.5 pr-4 text-slate-600">
                    {l.entity_type} #{l.entity_id}
                  </td>
                  <td className="py-2.5 text-slate-500 font-mono truncate max-w-xs">{l.details_json}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </main>
      </div>
    </div>
  );
};

const PackagePricingCard: React.FC<{ pkg: any; onSaved: () => void }> = ({ pkg, onSaved }) => {
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description || '');
  const [priceUsd, setPriceUsd] = useState(String(pkg.price_usd));
  const [priceNgn, setPriceNgn] = useState(String(pkg.price_ngn));
  const [durationDays, setDurationDays] = useState(String(pkg.duration_days));
  const [deliverablesText, setDeliverablesText] = useState(
    Array.isArray(pkg.deliverables) ? pkg.deliverables.join('\n') : ''
  );
  const [isActive, setIsActive] = useState(Boolean(pkg.is_active));
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-slate-500">
          {pkg.code} · {pkg.kind === 'seo_service' ? 'SEO Service' : 'Promotion'}
        </span>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Active</span>
        </label>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
      />
      <textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Package description"
        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
      />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">USD ($)</label>
          <input
            type="number"
            step="0.01"
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">NGN (₦)</label>
          <input
            type="number"
            step="100"
            value={priceNgn}
            onChange={(e) => setPriceNgn(e.target.value)}
            className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Days</label>
          <input
            type="number"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono"
          />
        </div>
      </div>
      <textarea
        rows={3}
        value={deliverablesText}
        onChange={(e) => setDeliverablesText(e.target.value)}
        placeholder="Deliverables (one per line)"
        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
      />
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await api.put(`/api/admin/packages/${pkg.id}`, {
              name,
              description,
              durationDays: Number(durationDays),
              priceUsd: Number(priceUsd),
              priceNgn: Number(priceNgn),
              deliverables: deliverablesText
                .split('\n')
                .map((s: string) => s.trim())
                .filter(Boolean),
              isActive,
            });
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
        className="min-h-[40px] px-4 rounded-xl bg-blue-700 text-white font-semibold hover:bg-blue-800"
      >
        {saving ? 'Saving...' : 'Save Package'}
      </button>
    </div>
  );
};

const ALL_PERMISSIONS = [
  'overview:read',
  'visitors:read',
  'customers:manage',
  'videos:manage',
  'campaigns:manage',
  'tasks:manage',
  'seo_orders:manage',
  'payments:manage',
  'reports:manage',
  'pricing:manage',
  'notifications:manage',
  'settings:site',
  'settings:gemini',
  'settings:youtube',
  'staff:manage',
  'roles:manage',
  'audit:read',
];

const RolePermissionEditor: React.FC<{ role: any; onSaved: () => void }> = ({ role, onSaved }) => {
  const [perms, setPerms] = useState<string[]>(role.permissions || []);
  const toggle = (p: string) => {
    setPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 text-xs">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{formatStatusLabel(role.name)}</h3>
        <p className="text-slate-500 mt-0.5">{role.description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {ALL_PERMISSIONS.map((p) => (
          <label key={p} className="inline-flex items-center gap-1.5 min-h-[28px]">
            <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} />
            <span className="font-mono text-[11px]">{p}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={async () => {
          await api.put(`/api/admin/roles/${role.id}`, { permissions: perms });
          onSaved();
        }}
        className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white font-semibold"
      >
        Save Permissions
      </button>
    </div>
  );
};

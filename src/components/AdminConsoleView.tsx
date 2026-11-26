import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  KeyRound,
  Layers,
  ListChecks,
  Rocket,
  Shield,
  Sparkles,
  UserCog,
  Users,
  Video,
} from 'lucide-react';
import { api, formatCount, formatCurrency, formatDateTime, formatStatusLabel } from '../lib/api';
import type { UserSession } from '../types';
import { AdminVisitorsPanel } from './AdminVisitorsPanel';

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
  | 'gemini'
  | 'youtube'
  | 'staff'
  | 'permissions'
  | 'audit';

const MODULES: Array<{ id: AdminModule; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'visitors', label: 'Site Visitors', icon: Eye },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'videos', label: 'Video Submissions', icon: Video },
  { id: 'campaigns', label: 'Campaigns', icon: Rocket },
  { id: 'tasks', label: 'Promotion Tasks', icon: ListChecks },
  { id: 'seo_orders', label: 'SEO Orders', icon: Layers },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'gemini', label: 'Gemini Config', icon: Sparkles },
  { id: 'youtube', label: 'YouTube API', icon: KeyRound },
  { id: 'staff', label: 'Staff Accounts', icon: UserCog },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'audit', label: 'Audit Logs', icon: Activity },
];

export const AdminConsoleView: React.FC<{
  user: UserSession;
  onNavigate?: (tab: string) => void;
}> = ({ user, onNavigate }) => {
  const [activeMod, setActiveMod] = useState<AdminModule>('overview');
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

  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRoleId, setStaffRoleId] = useState('2');
  const [staffTitle, setStaffTitle] = useState('Campaign Manager');

  const [geminiModel, setGeminiModel] = useState('gemini-4-hydrogen');
  const [geminiMaxComp, setGeminiMaxComp] = useState('8');
  const [ytApiKey, setYtApiKey] = useState('');
  const [ytRegion, setYtRegion] = useState('US');
  const [defaultProvider, setDefaultProvider] = useState('paystack');

  const loadModule = async (mod: AdminModule) => {
    if (mod === 'visitors') {
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
      } else if (mod === 'gemini' || mod === 'youtube') {
        const res = await api.get<{ settings: Array<{ key: string; value: string; hasValue: boolean }> }>(
          '/api/admin/settings'
        );
        setData((p) => ({ ...p, settings: res.settings }));
        const map = new Map(res.settings.map((s) => [s.key, s.value]));
        setGeminiModel(map.get('gemini_model') || 'gemini-4-hydrogen');
        setGeminiMaxComp(map.get('gemini_max_competitors') || '8');
        setYtApiKey(map.get('youtube_api_key') || '');
        setYtRegion(map.get('youtube_default_region') || 'US');
        setDefaultProvider(map.get('payment_default_provider') || 'paystack');
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

  if (!user.isAdmin) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Administrator authorization required.
      </div>
    );
  }

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="min-h-[40px] px-2.5 -ml-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Creator Home</span>
          </button>
        )}
        <div>
          <p className="text-xs font-semibold text-[#2563EB]">
            Administration Console · Role: {formatStatusLabel(user.adminRole || 'admin')}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Vantage Reach Operations</h1>
        </div>
      </div>

      {/* Horizontal scrollable module switcher on mobile, wrapped on desktop */}
      <div className="flex flex-nowrap lg:flex-wrap overflow-x-auto lg:overflow-visible gap-1.5 pb-1.5 -mx-1 px-1">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const active = activeMod === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setError('');
                setActiveMod(m.id);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
                active
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{m.label}</span>
            </button>
          );
        })}
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
              onClick={() => setActiveMod('visitors')}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 p-4 text-left transition-colors"
            >
              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Online Now</span>
              </p>
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatCount(data.overview.activeVisitorsNow ?? 0)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveMod('visitors')}
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
                <th className="py-2 pr-4">Video</th>
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2 pr-4 text-right">Baseline Views</th>
                <th className="py-2 pr-4 text-right">Latest Views</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.videos || []).map((v: any) => (
                <tr key={v.id}>
                  <td className="py-3 pr-4 font-semibold text-slate-900 max-w-xs truncate">{v.title}</td>
                  <td className="py-3 pr-4 text-slate-600">{v.owner_email}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{formatCount(v.baseline_views)}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{formatCount(v.latest_views)}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={async () => {
                        await api.post(`/api/admin/videos/${v.id}/snapshot`);
                        flash('New snapshot captured from YouTube.');
                        loadModule('videos');
                      }}
                      className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold whitespace-nowrap"
                    >
                      Capture Snapshot
                    </button>
                  </td>
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
              <div className="space-y-1">
                <p className="text-xs font-mono text-slate-500">
                  {c.campaign_ref} · {c.customer_email} · {c.duration_days}d · Payment: {formatStatusLabel(c.payment_status)}
                </p>
                <p className="text-sm font-bold text-slate-900">{c.title}</p>
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
      )}

      {!loading && activeMod === 'notifications' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await api.post('/api/admin/notifications/broadcast', {
              title: notifTitle,
              message: notifMessage,
            });
            setNotifTitle('');
            setNotifMessage('');
            flash('Announcement broadcast to all active accounts.');
          }}
          className="rounded-2xl border border-slate-200 bg-white p-5 max-w-xl space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">Broadcast Customer Notification</h2>
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
            placeholder="Message to active creators..."
            className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
          />
          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
          >
            Send Broadcast
          </button>
        </form>
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 max-w-xl space-y-4">
          <h2 className="text-base font-bold text-slate-900">YouTube Data API v3 &amp; Payment Gateway Config</h2>
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
                <option value="paystack">Paystack</option>
                <option value="flutterwave">Flutterwave</option>
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
              flash('YouTube API & gateway configuration saved.');
            }}
            className="min-h-[44px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
          >
            Save API Configuration
          </button>
        </div>
      )}

      {!loading && activeMod === 'staff' && (
        <div className="space-y-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
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
              flash('Staff account assigned.');
              loadModule('staff');
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
    </div>
  );
};

const PackagePricingCard: React.FC<{ pkg: any; onSaved: () => void }> = ({ pkg, onSaved }) => {
  const [name, setName] = useState(pkg.name);
  const [priceUsd, setPriceUsd] = useState(String(pkg.price_usd));
  const [priceNgn, setPriceNgn] = useState(String(pkg.price_ngn));
  const [durationDays, setDurationDays] = useState(String(pkg.duration_days));
  const [isActive, setIsActive] = useState(Boolean(pkg.is_active));
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-slate-500">{pkg.code}</span>
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
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await api.put(`/api/admin/packages/${pkg.id}`, {
            name,
            description: pkg.description,
            durationDays: Number(durationDays),
            priceUsd: Number(priceUsd),
            priceNgn: Number(priceNgn),
            deliverables: pkg.deliverables,
            isActive,
          });
          setSaving(false);
          onSaved();
        }}
        className="min-h-[40px] px-4 rounded-xl bg-blue-700 text-white font-semibold hover:bg-blue-800"
      >
        {saving ? 'Saving...' : 'Save Pricing'}
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

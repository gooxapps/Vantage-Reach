import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronRight,
  Clock,
  Compass,
  Download,
  Eye,
  Globe,
  Laptop,
  MapPin,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  UserCheck,
  UserX,
  Wifi,
  X,
} from 'lucide-react';
import { api, downloadAuthorizedFile, formatCount, formatDateTime, formatStatusLabel } from '../lib/api';

interface VisitorSummary {
  activeNow: number;
  todayVisitors: number;
  todaySessions: number;
  totalVisitors: number;
  totalSessions: number;
  totalPageViews: number;
  pwaVisitors: number;
  authenticatedVisitors: number;
}

interface VisitorSessionRow {
  id: number;
  visitor_id: string;
  session_id: string;
  user_id: number | null;
  user_email: string;
  ip_address: string;
  country: string;
  region: string;
  city: string;
  isp: string;
  timezone: string;
  language: string;
  device_type: 'Mobile' | 'Tablet' | 'Desktop' | 'Bot' | string;
  os_name: string;
  browser_name: string;
  device_vendor: string;
  user_agent: string;
  screen_resolution: string;
  viewport_size: string;
  platform: string;
  network_type: string;
  is_pwa: number;
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  entry_path: string;
  current_path: string;
  page_views: number;
  first_seen_at: string;
  last_seen_at: string;
  is_online: number;
}

interface VisitorEventRow {
  id: number;
  session_id: string;
  visitor_id: string;
  event_type: string;
  page_path: string;
  page_title: string;
  details_json: string;
  created_at: string;
}

interface VisitorAnalyticsResponse {
  summary: VisitorSummary;
  visitors: VisitorSessionRow[];
  breakdowns: {
    devices: Array<{ label: string; count: number }>;
    locations: Array<{ country: string; count: number }>;
    browsers: Array<{ label: string; count: number }>;
    operatingSystems: Array<{ label: string; count: number }>;
    topPages: Array<{ path: string; views: number; sessions: number }>;
    topReferrers: Array<{ referrer: string; count: number }>;
    hourlyTraffic: Array<{ hour: string; sessions: number; pageViews: number }>;
  };
}

function DeviceIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  switch (type) {
    case 'Mobile':
      return <Smartphone className={className} />;
    case 'Tablet':
      return <Tablet className={className} />;
    case 'Bot':
      return <Bot className={className} />;
    default:
      return <Monitor className={className} />;
  }
}

function formatLocation(v: Pick<VisitorSessionRow, 'city' | 'region' | 'country'>): string {
  const parts = [v.city, v.region, v.country].filter((p) => p && p !== 'Internal');
  if (parts.length > 0) return parts.join(', ');
  return v.country || 'Unknown';
}

export const AdminVisitorsPanel: React.FC = () => {
  const [windowKey, setWindowKey] = useState<'live' | '24h' | '7d' | '30d' | 'all'>('24h');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [authFilter, setAuthFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [analytics, setAnalytics] = useState<VisitorAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<{
    session: VisitorSessionRow;
    events: VisitorEventRow[];
    priorSessionsCount: number;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 260);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchVisitors = useCallback(
    async (silent = false) => {
      if (!silent) setLoading((prev) => prev && !analytics);
      setRefreshing(true);
      setError('');
      try {
        const qs = new URLSearchParams({
          window: windowKey,
          device: deviceFilter,
          authFilter,
          search: debouncedSearch,
        });
        const res = await api.get<VisitorAnalyticsResponse>(`/api/admin/visitors?${qs.toString()}`);
        setAnalytics(res);
      } catch (err: any) {
        setError(err.message || 'Unable to load visitor telemetry.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [windowKey, deviceFilter, authFilter, debouncedSearch]
  );

  useEffect(() => {
    void fetchVisitors();
  }, [fetchVisitors]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchVisitors(true);
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchVisitors]);

  const openSessionDetail = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSessionDetail(null);
    setLoadingDetail(true);
    try {
      const res = await api.get<{
        session: VisitorSessionRow;
        events: VisitorEventRow[];
        priorSessionsCount: number;
      }>(`/api/admin/visitors/${encodeURIComponent(sessionId)}`);
      setSessionDetail(res);
    } catch (err: any) {
      setError(err.message || 'Could not load visitor session timeline.');
      setSelectedSessionId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const qs = new URLSearchParams({
        window: windowKey,
        device: deviceFilter,
        authFilter,
        search: debouncedSearch,
      });
      await downloadAuthorizedFile(
        `/api/admin/visitors-export?${qs.toString()}`,
        `vantage-reach-visitors-${windowKey}.csv`
      );
    } catch (err: any) {
      setError(err.message || 'Could not export visitor log.');
    }
  };

  if (loading && !analytics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
        </div>
        <div className="h-56 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  const summary = analytics?.summary || {
    activeNow: 0,
    todayVisitors: 0,
    todaySessions: 0,
    totalVisitors: 0,
    totalSessions: 0,
    totalPageViews: 0,
    pwaVisitors: 0,
    authenticatedVisitors: 0,
  };
  const visitors = analytics?.visitors || [];
  const breakdowns = analytics?.breakdowns;
  const maxDeviceCount = Math.max(1, ...(breakdowns?.devices || []).map((d) => d.count));
  const maxLocationCount = Math.max(1, ...(breakdowns?.locations || []).map((l) => l.count));

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Live Controls Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Radio className={`w-5 h-5 ${summary.activeNow > 0 ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Real-Time Site Traffic &amp; Visitor Monitor</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>{formatCount(summary.activeNow)} online</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks every visitor entering Vantage Reach—device, location, browser, screen, network, referrer, and live page journey.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              autoRefresh
                ? 'border-blue-200 bg-blue-50 text-[#2563EB]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{autoRefresh ? 'Live Sync On' : 'Live Sync Paused'}</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchVisitors(true)}
            disabled={refreshing}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#2563EB]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[40px] px-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Now (3m)</span>
            <Radio className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1.5">
            {formatCount(summary.activeNow)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Visitors currently on site</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Visitors (24h)</span>
            <Eye className="w-4 h-4 text-[#2563EB]" />
          </div>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1.5">
            {formatCount(summary.todayVisitors)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {formatCount(summary.todaySessions)} total visits today
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>All-Time Visitors</span>
            <Globe className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1.5">
            {formatCount(summary.totalVisitors)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {formatCount(summary.totalPageViews)} screen views logged
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Signed-In / PWA</span>
            <UserCheck className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1.5">
            {formatCount(summary.authenticatedVisitors)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {formatCount(summary.pwaVisitors)} installed PWA visitors
          </p>
        </div>
      </div>

      {/* Breakdown Cards */}
      {breakdowns && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Devices */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Devices</span>
            </h3>
            {breakdowns.devices.length === 0 ? (
              <p className="text-xs text-slate-400">No device data in window.</p>
            ) : (
              <div className="space-y-2.5">
                {breakdowns.devices.map((d) => (
                  <div key={d.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                        <DeviceIcon type={d.label} className="w-3.5 h-3.5 text-slate-500" />
                        <span>{d.label}</span>
                      </span>
                      <span className="font-mono font-bold text-slate-700">{d.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#2563EB]"
                        style={{ width: `${Math.round((d.count / maxDeviceCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Locations */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Locations</span>
            </h3>
            {breakdowns.locations.length === 0 ? (
              <p className="text-xs text-slate-400">No location data in window.</p>
            ) : (
              <div className="space-y-2.5">
                {breakdowns.locations.slice(0, 5).map((loc) => (
                  <div key={loc.country} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-slate-800 truncate">{loc.country}</span>
                      <span className="font-mono font-bold text-slate-700 shrink-0">{loc.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.round((loc.count / maxLocationCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Browsers & OS */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Browsers &amp; OS</span>
            </h3>
            <div className="space-y-2 text-xs">
              {breakdowns.browsers.slice(0, 4).map((b) => (
                <div key={b.label} className="flex items-center justify-between">
                  <span className="text-slate-700 truncate">{b.label}</span>
                  <span className="font-mono font-semibold text-slate-900">{b.count}</span>
                </div>
              ))}
              {breakdowns.operatingSystems.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  {breakdowns.operatingSystems.slice(0, 3).map((os) => (
                    <div key={os.label} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 truncate">{os.label}</span>
                      <span className="font-mono text-slate-700">{os.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top Pages & Referrers */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Pages &amp; Sources</span>
            </h3>
            <div className="space-y-2 text-xs">
              {breakdowns.topPages.slice(0, 4).map((p) => (
                <div key={p.path} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-800 truncate">{p.path}</span>
                  <span className="font-mono text-slate-600 shrink-0">{p.views}v</span>
                </div>
              ))}
              {breakdowns.topReferrers.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  {breakdowns.topReferrers.slice(0, 3).map((r) => (
                    <div key={r.referrer} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-500 truncate">{r.referrer || 'Direct'}</span>
                      <span className="font-mono text-slate-700 shrink-0">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'live', label: 'Online Now' },
            { id: '24h', label: 'Last 24h' },
            { id: '7d', label: '7 Days' },
            { id: '30d', label: '30 Days' },
            { id: 'all', label: 'All Time' },
          ].map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWindowKey(w.id as any)}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-colors ${
                windowKey === w.id
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search IP, email, city, country, page, browser..."
              className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB]"
            />
          </div>

          <select
            aria-label="Filter by device type"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="sm:col-span-3 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <option value="all">All Devices</option>
            <option value="Mobile">Mobile</option>
            <option value="Desktop">Desktop</option>
            <option value="Tablet">Tablet</option>
            <option value="Bot">Bots</option>
          </select>

          <select
            aria-label="Filter by visitor account status"
            value={authFilter}
            onChange={(e) => setAuthFilter(e.target.value)}
            className="sm:col-span-3 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <option value="all">All Visitors</option>
            <option value="authenticated">Signed-In Users</option>
            <option value="anonymous">Guest Visitors</option>
          </select>
        </div>
      </div>

      {/* Live Visitor Session Feed */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900">
            Visitor Sessions ({visitors.length})
          </span>
          <span className="text-[11px] text-slate-500">Tap any visitor for full journey &amp; hardware details</span>
        </div>

        {visitors.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <Globe className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No matching visitor sessions</p>
            <p className="text-xs text-slate-500">
              Try widening the time window or clearing search filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visitors.map((v) => {
              const online = Boolean(v.is_online);
              return (
                <button
                  key={v.session_id}
                  type="button"
                  onClick={() => void openSessionDetail(v.session_id)}
                  className="w-full p-4 text-left hover:bg-slate-50/90 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          online
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            online ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        <span>{online ? 'Online Now' : formatDateTime(v.last_seen_at)}</span>
                      </span>

                      {v.user_email ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-[#2563EB] text-[11px] font-semibold">
                          <UserCheck className="w-3 h-3" />
                          <span>{v.user_email}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                          <UserX className="w-3 h-3" />
                          <span>Guest · {v.visitor_id.slice(0, 10)}</span>
                        </span>
                      )}

                      {v.is_pwa === 1 && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold">
                          Installed PWA
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                        <MapPin className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                        <span>{formatLocation(v)}</span>
                      </span>
                      {v.ip_address && (
                        <span className="font-mono text-[11px] text-slate-500">{v.ip_address}</span>
                      )}
                      {v.timezone && (
                        <span className="text-[11px] text-slate-500">{v.timezone}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                        <DeviceIcon type={v.device_type} className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {v.device_vendor || v.device_type} · {v.os_name} · {v.browser_name}
                        </span>
                      </span>
                      {v.screen_resolution && <span>Screen {v.screen_resolution}</span>}
                      {v.network_type && (
                        <span className="inline-flex items-center gap-1 uppercase">
                          <Wifi className="w-3 h-3" />
                          <span>{v.network_type}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-mono font-semibold text-[#2563EB]">{v.current_path}</p>
                      <p className="text-[11px] text-slate-500">
                        {v.page_views} {v.page_views === 1 ? 'view' : 'views'} · Entry {v.entry_path}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Visitor Session Detail Modal */}
      {selectedSessionId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="visitor-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-2xl max-h-[88vh] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h3 id="visitor-detail-title" className="text-base font-bold text-slate-900">
                  Visitor Telemetry &amp; Journey
                </h3>
                <p className="text-[11px] font-mono text-slate-500 truncate">{selectedSessionId}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedSessionId(null);
                  setSessionDetail(null);
                }}
                aria-label="Close visitor detail"
                className="min-h-[40px] min-w-[40px] rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {loadingDetail || !sessionDetail ? (
                <div className="h-44 rounded-xl bg-slate-100 animate-pulse" />
              ) : (
                <>
                  {/* Identity & Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Identity &amp; Network
                      </p>
                      <p className="font-semibold text-slate-900">
                        {sessionDetail.session.user_email || 'Anonymous Guest Visitor'}
                      </p>
                      <p className="text-slate-600">
                        Location: <strong>{formatLocation(sessionDetail.session)}</strong>
                      </p>
                      <p className="text-slate-600 font-mono">
                        IP: {sessionDetail.session.ip_address || 'Unavailable'}
                      </p>
                      {sessionDetail.session.isp && (
                        <p className="text-slate-600">ISP: {sessionDetail.session.isp}</p>
                      )}
                      <p className="text-slate-600">
                        Timezone: {sessionDetail.session.timezone || '—'} · Lang:{' '}
                        {sessionDetail.session.language || '—'}
                      </p>
                      <p className="text-slate-500">
                        Total sessions from this browser: <strong>{sessionDetail.priorSessionsCount}</strong>
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Device &amp; Environment
                      </p>
                      <p className="font-semibold text-slate-900">
                        {sessionDetail.session.device_vendor || sessionDetail.session.device_type} (
                        {sessionDetail.session.device_type})
                      </p>
                      <p className="text-slate-600">
                        OS: {sessionDetail.session.os_name} · Browser: {sessionDetail.session.browser_name}
                      </p>
                      <p className="text-slate-600">
                        Screen: {sessionDetail.session.screen_resolution || '—'} · Viewport:{' '}
                        {sessionDetail.session.viewport_size || '—'}
                      </p>
                      <p className="text-slate-600">
                        Mode: {sessionDetail.session.is_pwa ? 'Installed PWA' : 'Web Browser'}
                        {sessionDetail.session.network_type
                          ? ` · Network: ${sessionDetail.session.network_type.toUpperCase()}`
                          : ''}
                      </p>
                      <p className="text-slate-600 truncate">
                        Referrer: {sessionDetail.session.referrer || 'Direct'}
                      </p>
                      {(sessionDetail.session.utm_source ||
                        sessionDetail.session.utm_medium ||
                        sessionDetail.session.utm_campaign) && (
                        <p className="text-slate-500 font-mono text-[11px]">
                          UTM: {[
                            sessionDetail.session.utm_source,
                            sessionDetail.session.utm_medium,
                            sessionDetail.session.utm_campaign,
                          ]
                            .filter(Boolean)
                            .join(' / ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {sessionDetail.session.user_agent && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 font-mono break-all">
                      <span className="font-sans font-bold text-slate-500 uppercase mr-1.5">User-Agent:</span>
                      {sessionDetail.session.user_agent}
                    </div>
                  )}

                  {/* Chronological Event Timeline */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Activity &amp; Page Timeline ({sessionDetail.events.length})</span>
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        First seen {formatDateTime(sessionDetail.session.first_seen_at)}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {sessionDetail.events.map((ev) => (
                        <div key={ev.id} className="px-3.5 py-2.5 text-xs flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] font-semibold text-[11px] mr-2">
                              {formatStatusLabel(ev.event_type)}
                            </span>
                            <span className="font-mono font-semibold text-slate-900">{ev.page_path}</span>
                            {ev.page_title && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">{ev.page_title}</p>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {formatDateTime(ev.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

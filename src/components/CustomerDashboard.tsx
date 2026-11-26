import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  FileText,
  Link2,
  Play,
  Rocket,
} from 'lucide-react';
import { api, formatCompact, formatDate, formatStatusLabel } from '../lib/api';
import type { CampaignRecord, UserSession, VideoRecord } from '../types';
import { PromoDiscoveryIllustration, ThumbnailImage } from './BrandMark';

interface CustomerDashboardProps {
  user: UserSession;
  onNavigate: (tab: string, videoId?: number) => void;
}

interface DashboardResponse {
  stats: {
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalSpending: number;
    totalVideos: number;
    totalTrackedViews: number;
    availableReports?: number;
    unreadNotifications: number;
  };
  recentCampaigns: CampaignRecord[];
  recentVideos: VideoRecord[];
}

function getCampaignStatusBadge(status: string) {
  switch (status) {
    case 'in_progress':
    case 'approved':
    case 'scheduled':
      return {
        label: formatStatusLabel(status),
        className: 'bg-emerald-50 text-emerald-700',
        icon: Play,
      };
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-blue-50 text-blue-700',
        icon: CheckCircle2,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'bg-slate-100 text-slate-600',
        icon: Clock,
      };
    default:
      return {
        label: formatStatusLabel(status),
        className: 'bg-amber-50 text-amber-700',
        icon: Clock,
      };
  }
}

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ user, onNavigate }) => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .get<DashboardResponse>('/api/dashboard')
      .then((dash) => {
        if (!active) return;
        if (!dash || typeof dash !== 'object' || !dash.stats) {
          setError('Dashboard metrics could not be loaded cleanly. Please retry.');
          setData(null);
          return;
        }
        setData(dash);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Could not load dashboard metrics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadNonce]);

  useEffect(() => {
    const onSync = () => setReloadNonce((n) => n + 1);
    window.addEventListener('vantage:app-sync', onSync);
    return () => window.removeEventListener('vantage:app-sync', onSync);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="space-y-2 pt-1">
          <div className="h-8 w-56 rounded-lg bg-slate-100" />
          <div className="h-4 w-72 rounded-lg bg-slate-100" />
        </div>
        <div className="h-32 rounded-2xl bg-blue-100/70" />
        <div className="h-14 rounded-2xl bg-blue-100/60" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
        </div>
        <div className="h-40 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error || !data?.stats) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span>{error || 'Unable to load dashboard.'}</span>
        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          className="min-h-[40px] px-4 rounded-xl bg-white border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100/50 shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = data.stats;
  const recentCampaigns = Array.isArray(data.recentCampaigns) ? data.recentCampaigns : [];
  const recentVideos = Array.isArray(data.recentVideos) ? data.recentVideos : [];
  const firstName = (user.fullName || user.email.split('@')[0]).split(' ')[0];
  const totalVideosCount = Number(stats.totalVideos ?? 0);
  const availableReportsCount =
    typeof stats.availableReports === 'number' ? stats.availableReports : totalVideosCount;

  const statCards = [
    {
      label: 'Active Campaigns',
      value: Number(stats.activeCampaigns ?? 0),
      iconBg: 'bg-blue-50 text-[#2563EB]',
      icon: Play,
      filledIcon: true,
      onClick: () => onNavigate('campaigns'),
    },
    {
      label: 'Completed Campaigns',
      value: Number(stats.completedCampaigns ?? 0),
      iconBg: 'bg-emerald-50 text-emerald-600',
      icon: Check,
      filledIcon: false,
      onClick: () => onNavigate('campaigns'),
    },
    {
      label: 'Submitted Links',
      value: totalVideosCount,
      iconBg: 'bg-violet-50 text-violet-600',
      icon: BarChart2,
      filledIcon: false,
      onClick: () => onNavigate(totalVideosCount > 0 && Number(stats.totalCampaigns ?? 0) === 0 ? 'plans' : 'campaigns'),
    },
    {
      label: 'Available Reports',
      value: availableReportsCount,
      iconBg: 'bg-amber-50 text-amber-600',
      icon: FileText,
      filledIcon: false,
      onClick: () => onNavigate('reports'),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Welcoming Heading & Supporting Text */}
      <section className="pt-0.5">
        <h1 className="text-[26px] sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Welcome back, {firstName}!
        </h1>
        <p className="text-[15px] text-slate-600 mt-1 leading-snug max-w-xl">
          Let&apos;s help your content reach the right audience.
        </p>
      </section>

      {/* Promotional Hero Banner */}
      <section
        aria-label="YouTube Discovery Promotion"
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2563EB] via-[#1D4ED8] to-[#1E40AF] text-white px-4 py-4 sm:px-6 sm:py-5 shadow-md shadow-blue-600/15"
      >
        {/* Subtle Decorative Diagonal Highlights */}
        <svg
          viewBox="0 0 36 28"
          fill="none"
          aria-hidden="true"
          className="absolute top-3.5 right-4 w-6 h-5 text-[#FDE047] opacity-90 pointer-events-none"
        >
          <path d="M5 20L15 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M18 22L28 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>

        <div className="grid grid-cols-12 items-center gap-2 sm:gap-5">
          <div className="col-span-5 sm:col-span-4 lg:col-span-3 flex items-center justify-center">
            <PromoDiscoveryIllustration />
          </div>

          <div className="col-span-7 sm:col-span-8 lg:col-span-9 flex flex-col justify-between">
            <h2 className="text-[17px] sm:text-xl lg:text-2xl font-extrabold leading-[1.2] tracking-tight pr-4">
              Give Your Videos <span className="text-[#FDE047]">More Opportunities</span> to Be Discovered.
            </h2>

            <div className="mt-3 flex items-center justify-end sm:justify-start">
              <button
                type="button"
                onClick={() => onNavigate('plans')}
                className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-white text-slate-900 text-xs font-bold hover:bg-blue-50 transition-colors inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              >
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-800" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Prominent Blue Drop Video & Channel Link CTA */}
      <button
        type="button"
        onClick={() => onNavigate('submit')}
        className="w-full min-h-[54px] px-5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] text-white font-semibold text-[15px] sm:text-base shadow-md shadow-blue-600/20 grid grid-cols-[20px_1fr_20px] items-center transition-all"
      >
        <span aria-hidden="true" />
        <span className="inline-flex items-center justify-center gap-2.5 whitespace-nowrap">
          <Link2 className="w-5 h-5 shrink-0" />
          <span>Drop Channel or Video Link</span>
        </span>
        <ChevronRight className="w-5 h-5 justify-self-end text-white/90 shrink-0" />
      </button>

      {/* Four Statistic Cards */}
      <section aria-label="Account Statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:border-blue-300 p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors min-h-[80px]"
            >
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${card.iconBg} flex items-center justify-center shrink-0`}
              >
                <Icon className={`w-5 h-5 ${card.filledIcon ? 'fill-current' : 'stroke-[2.5]'}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[22px] sm:text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
                  {card.value}
                </p>
                <p className="text-[11.5px] sm:text-xs font-medium text-slate-600 mt-1 leading-tight">
                  {card.label}
                </p>
              </div>
            </button>
          );
        })}
      </section>

      {/* Recent Campaigns Section */}
      <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Recent Campaigns</h2>
          <button
            type="button"
            onClick={() => onNavigate('campaigns')}
            className="min-h-[36px] text-xs font-semibold text-[#2563EB] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentCampaigns.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-5 text-center">
            <p className="text-sm font-semibold text-slate-800">No promotion campaigns yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Drop your YouTube channel link or video link, then pay $1 to promote it on our platform.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('submit')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1D4ED8]"
              >
                Drop Link
              </button>
              <button
                type="button"
                onClick={() => onNavigate('plans')}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Promote ($1 VIP)
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentCampaigns.map((c) => {
              const badge = getCampaignStatusBadge(c.status);
              const StatusIcon = badge.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNavigate('campaigns')}
                  className="w-full py-3 first:pt-1 last:pb-1 flex items-center gap-3.5 text-left hover:bg-slate-50/80 rounded-xl px-1.5 -mx-1.5 transition-colors"
                >
                  <div className="w-[100px] h-[60px] sm:w-28 sm:h-16 rounded-xl overflow-hidden shrink-0 bg-slate-100 border border-slate-200/60">
                    <ThumbnailImage src={c.thumbnail_url} alt={c.video_title || c.title} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-[15px] font-bold text-slate-900 truncate">
                      {c.video_title || c.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-500 whitespace-nowrap">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{formatDate(c.start_date || c.purchase_date)}</span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${badge.className}`}
                      >
                        <StatusIcon className="w-3 h-3 shrink-0" />
                        <span>{badge.label}</span>
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Promote Shortcuts & Recently Dropped Videos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Promote on Our Platform</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('submit')}
              className="min-h-[84px] rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/70 hover:border-blue-200 p-3.5 text-left transition-colors flex flex-col justify-between"
            >
              <Rocket className="w-5 h-5 text-[#2563EB]" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-900">Drop Link</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Channel or video link</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('plans')}
              className="min-h-[84px] rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/70 hover:border-blue-200 p-3.5 text-left transition-colors flex flex-col justify-between"
            >
              <Crown className="w-5 h-5 text-[#2563EB]" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-900">Promote ($1)</p>
                <p className="text-[11px] text-slate-500 mt-0.5">VIP membership fee</p>
              </div>
            </button>
          </div>
        </section>

        <section className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold text-slate-900">Recently Submitted Links</h2>
            <button
              type="button"
              onClick={() => onNavigate('plans')}
              className="text-xs font-semibold text-[#2563EB] hover:underline whitespace-nowrap"
            >
              Promote
            </button>
          </div>

          {recentVideos.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">No links dropped yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Paste your channel link or video link to start your $1 promotion.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('submit')}
                className="min-h-[40px] px-3.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1D4ED8] whitespace-nowrap shrink-0"
              >
                Drop Now
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentVideos.slice(0, 3).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onNavigate('plans', v.id)}
                  className="w-full py-2.5 first:pt-0 last:pb-0 flex items-center gap-3 text-left hover:bg-slate-50/80 rounded-xl px-1.5 -mx-1.5 transition-colors"
                >
                  <div className="w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                    <ThumbnailImage src={v.thumbnail_url} alt={v.title} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{v.title}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {v.channel_url || v.channel_name || formatCompact(v.latest_views)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

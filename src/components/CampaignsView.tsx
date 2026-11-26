import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Megaphone,
  PauseCircle,
  Play,
  Rocket,
  X,
} from 'lucide-react';
import { api, formatCurrency, formatDate, formatDateTime, formatStatusLabel } from '../lib/api';
import type { CampaignRecord } from '../types';
import { ThumbnailImage } from './BrandMark';

interface CampaignsViewProps {
  onNavigate: (tab: string) => void;
}

type CampaignFilter = 'all' | 'pending' | 'in_progress' | 'completed';

interface CampaignDetailResponse {
  campaign: CampaignRecord;
  activities: Array<{
    id: number;
    actor_type: string;
    activity_type: string;
    summary: string;
    details: string;
    created_at: string;
  }>;
  reports: Array<{
    id: number;
    summary: string;
    measured_views_delta: number | null;
    measured_likes_delta: number | null;
    measured_subs_delta: number | null;
    attribution_note: string;
    deliverablesCompleted: string[];
    created_at: string;
  }>;
}

function getStatusPresentation(status: string) {
  switch (status) {
    case 'awaiting_payment':
    case 'under_review':
      return {
        bucket: 'pending' as const,
        label: status === 'awaiting_payment' ? 'Pending Payment' : 'Pending Review',
        badgeClass: 'bg-orange-50 text-orange-700 border border-orange-200/80',
        icon: Clock,
      };
    case 'approved':
    case 'scheduled':
    case 'in_progress':
      return {
        bucket: 'in_progress' as const,
        label: status === 'in_progress' ? 'In Progress' : formatStatusLabel(status),
        badgeClass: 'bg-blue-50 text-[#2563EB] border border-blue-200/80',
        icon: Play,
      };
    case 'completed':
      return {
        bucket: 'completed' as const,
        label: 'Completed',
        badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
        icon: CheckCircle2,
      };
    default:
      return {
        bucket: 'on_hold' as const,
        label: status === 'cancelled' ? 'On Hold / Cancelled' : 'On Hold',
        badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
        icon: PauseCircle,
      };
  }
}

function getCampaignProgress(c: CampaignRecord): { show: boolean; percent: number; caption: string } {
  if (c.status === 'completed') {
    return {
      show: true,
      percent: 100,
      caption: `${c.duration_days} of ${c.duration_days} days completed`,
    };
  }

  if (c.status === 'in_progress') {
    if (c.start_date && c.end_date) {
      const startMs = new Date(c.start_date.includes('T') ? c.start_date : c.start_date.replace(' ', 'T') + 'Z').getTime();
      const endMs = new Date(c.end_date.includes('T') ? c.end_date : c.end_date.replace(' ', 'T') + 'Z').getTime();
      const nowMs = Date.now();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        const rawPct = Math.round(((nowMs - startMs) / (endMs - startMs)) * 100);
        const pct = Math.min(98, Math.max(8, rawPct));
        const totalDays = Math.max(1, c.duration_days || Math.ceil((endMs - startMs) / 86_400_000));
        const elapsedDays = Math.min(totalDays, Math.max(1, Math.ceil((nowMs - startMs) / 86_400_000)));
        return {
          show: true,
          percent: pct,
          caption: `Day ${elapsedDays} of ${totalDays} · ${pct}%`,
        };
      }
    }
    return {
      show: true,
      percent: 35,
      caption: `Active · ${c.duration_days}-day schedule`,
    };
  }

  if (c.status === 'approved' || c.status === 'scheduled') {
    return {
      show: true,
      percent: 15,
      caption: `Scheduled · ${c.duration_days}-day plan`,
    };
  }

  return { show: false, percent: 0, caption: '' };
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({ onNavigate }) => {
  const [filter, setFilter] = useState<CampaignFilter>('all');
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [detail, setDetail] = useState<CampaignDetailResponse | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCampaigns = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<{ campaigns: CampaignRecord[] }>('/api/campaigns');
      setCampaigns(res.campaigns || []);
    } catch (err: any) {
      setError(err.message || 'Could not load your campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const openDetail = async (id: number) => {
    setLoadingDetailId(id);
    setError('');
    try {
      const res = await api.get<CampaignDetailResponse>(`/api/campaigns/${id}`);
      setDetail(res);
    } catch (err: any) {
      setError(err.message || 'Could not load campaign details.');
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await api.post(`/api/campaigns/${id}/cancel`);
      setDetail(null);
      await loadCampaigns();
    } catch (err: any) {
      setError(err.message || 'Could not cancel campaign.');
    }
  };

  const summary = useMemo(() => {
    let active = 0;
    let completed = 0;
    let pending = 0;
    for (const c of campaigns) {
      const bucket = getStatusPresentation(c.status).bucket;
      if (bucket === 'in_progress') active += 1;
      else if (bucket === 'completed') completed += 1;
      else if (bucket === 'pending') pending += 1;
    }
    return {
      total: campaigns.length,
      active,
      completed,
      pending,
    };
  }, [campaigns]);

  const filtered = useMemo(() => {
    if (filter === 'all') return campaigns;
    return campaigns.filter((c) => getStatusPresentation(c.status).bucket === filter);
  }, [campaigns, filter]);

  const filterTabs: Array<{ id: CampaignFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
  ];

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="space-y-2 pt-0.5">
          <div className="h-8 w-44 rounded-lg bg-slate-100" />
          <div className="h-4 w-72 rounded-lg bg-slate-100" />
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
        </div>
        <div className="h-11 rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-52 rounded-2xl bg-slate-100" />
          <div className="h-52 rounded-2xl bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Page Heading & Supporting Text */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-0.5">
        <div>
          <h1 className="text-[26px] sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            My Campaigns
          </h1>
          <p className="text-[15px] text-slate-600 mt-1 leading-snug">
            Track and manage your video promotion campaigns.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('submit')}
          className="hidden sm:inline-flex min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold shadow-sm shadow-blue-600/20 items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
        >
          <Rocket className="w-4 h-4" />
          <span>Launch Campaign</span>
        </button>
      </section>

      {/* Campaign Summary Cards */}
      <section aria-label="Campaign Summary" className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
              {summary.total}
            </p>
            <p className="text-[11px] sm:text-xs font-medium text-slate-600 mt-1 leading-tight">
              Total Campaigns
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
          </div>
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
              {summary.active}
            </p>
            <p className="text-[11px] sm:text-xs font-medium text-slate-600 mt-1 leading-tight">
              Active Campaigns
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
              {summary.completed}
            </p>
            <p className="text-[11px] sm:text-xs font-medium text-slate-600 mt-1 leading-tight">
              Completed Campaigns
            </p>
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      <div
        role="tablist"
        aria-label="Filter campaigns by status"
        className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-100/90 border border-slate-200/60 sm:w-fit sm:min-w-[420px]"
      >
        {filterTabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.id)}
              className={`min-h-[40px] px-2 sm:px-4 rounded-xl text-[12px] sm:text-xs font-semibold transition-all whitespace-nowrap ${
                active
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-red-700">{error}</p>
          <button
            type="button"
            onClick={loadCampaigns}
            className="min-h-[36px] px-3 rounded-xl bg-white border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Campaign List or Empty State */}
      {campaigns.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-7 sm:p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-[#2563EB] mx-auto flex items-center justify-center">
            <Rocket className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-4">No campaigns launched yet</h2>
          <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
            Submit a YouTube video to capture your baseline stats and start your first promotion campaign.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('submit')}
            className="mt-5 min-h-[48px] px-6 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold shadow-md shadow-blue-600/20 inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Rocket className="w-4 h-4" />
            <span>Launch Campaign</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-7 text-center">
          <p className="text-sm font-bold text-slate-900">
            No {filterTabs.find((t) => t.id === filter)?.label.toLowerCase()} campaigns
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Switch to All campaigns or submit a new YouTube video to launch another campaign.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800"
            >
              Show All Campaigns
            </button>
            <button
              type="button"
              onClick={() => onNavigate('submit')}
              className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
            >
              Launch Campaign
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const statusUI = getStatusPresentation(c.status);
            const StatusIcon = statusUI.icon;
            const progress = getCampaignProgress(c);
            const videoTitle = c.video_title || c.title;
            const campaignType = c.package_name || 'YouTube Promotion';
            const displayDate = c.start_date || c.purchase_date;
            const isOpening = loadingDetailId === c.id;

            return (
              <article
                key={c.id}
                className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 flex flex-col justify-between gap-3.5 hover:border-blue-200 transition-colors"
              >
                {/* Top: Thumbnail + Title + Status */}
                <button
                  type="button"
                  onClick={() => openDetail(c.id)}
                  className="flex items-start gap-3.5 text-left w-full group"
                >
                  <div className="w-28 h-[68px] sm:w-32 sm:h-[76px] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/70 shrink-0">
                    <ThumbnailImage src={c.thumbnail_url} alt={videoTitle} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${statusUI.badgeClass}`}
                    >
                      <StatusIcon className="w-3 h-3 shrink-0" />
                      <span>{statusUI.label}</span>
                    </span>

                    <h2 className="text-sm sm:text-[15px] font-bold text-slate-900 group-hover:text-[#2563EB] line-clamp-2 mt-1.5 leading-snug transition-colors">
                      {videoTitle}
                    </h2>

                    <p className="text-xs font-medium text-slate-500 mt-1 truncate">
                      {campaignType}
                    </p>
                  </div>
                </button>

                {/* Duration & Start Date */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block leading-none">Duration</span>
                      <span className="font-semibold text-slate-800 mt-0.5 block truncate tabular-nums">
                        {c.duration_days} {c.duration_days === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600 min-w-0">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block leading-none">
                        {c.start_date ? 'Start Date' : 'Purchased'}
                      </span>
                      <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                        {formatDate(displayDate)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress Indicator (when applicable) */}
                {progress.show && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-500">Campaign Progress</span>
                      <span className="font-semibold text-slate-700 tabular-nums">{progress.caption}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          c.status === 'completed' ? 'bg-emerald-600' : 'bg-[#2563EB]'
                        }`}
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* View Details Action */}
                <button
                  type="button"
                  onClick={() => openDetail(c.id)}
                  disabled={isOpening}
                  className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50/90 hover:bg-blue-50 hover:border-blue-200 text-xs font-semibold text-slate-800 hover:text-[#2563EB] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
                >
                  <span>{isOpening ? 'Loading Details...' : 'View Details'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Campaign Details Modal / Bottom Sheet */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 p-0 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 max-h-[90vh] overflow-y-auto space-y-5 pb-safe">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono text-slate-500">{detail.campaign.campaign_ref}</p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5 leading-snug">
                  {detail.campaign.video_title || detail.campaign.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {detail.campaign.package_name || 'YouTube Promotion'} ·{' '}
                  {formatCurrency(detail.campaign.amount_paid, detail.campaign.currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Close campaign details"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <div>
                <span className="text-slate-500 block">Status</span>
                <strong className="text-[#2563EB]">{getStatusPresentation(detail.campaign.status).label}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Payment</span>
                <strong className="text-slate-900">{formatStatusLabel(detail.campaign.payment_status)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Duration</span>
                <strong className="text-slate-900 tabular-nums">{detail.campaign.duration_days} days</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Regions</span>
                <strong className="text-slate-900">{detail.campaign.target_regions}</strong>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                <span>Campaign Deliverables</span>
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {detail.campaign.deliverables.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#2563EB]" />
                <span>Promotion Activity Log</span>
              </h4>
              {detail.activities.length === 0 ? (
                <p className="text-xs text-slate-500">No promotion activities recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {detail.activities.map((a) => (
                    <div key={a.id} className="p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-slate-900">{a.summary}</strong>
                        <span className="text-slate-400 shrink-0">{formatDateTime(a.created_at)}</span>
                      </div>
                      {a.details && <p className="text-slate-600 mt-1">{a.details}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {detail.reports.length > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#2563EB]" />
                  <span>Completion Report</span>
                </h4>
                {detail.reports.map((r) => (
                  <div key={r.id} className="text-xs text-slate-700 space-y-1.5">
                    <p>{r.summary}</p>
                    <p className="text-[11px] text-slate-500">{r.attribution_note}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              {['awaiting_payment', 'under_review', 'scheduled'].includes(detail.campaign.status) ? (
                <button
                  type="button"
                  onClick={() => handleCancel(detail.campaign.id)}
                  className="min-h-[44px] px-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                >
                  Cancel Campaign
                </button>
              ) : (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {formatDate(detail.campaign.purchase_date)}
                </span>
              )}
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="min-h-[44px] px-5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

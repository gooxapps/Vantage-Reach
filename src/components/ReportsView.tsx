import React, { useEffect, useState } from 'react';
import { Download, Info, Lock } from 'lucide-react';
import { api, downloadAuthorizedFile, formatCount, formatDateTime } from '../lib/api';
import type { VideoRecord, VideoSnapshot } from '../types';
import { SnapshotLineChart } from './Charts';

interface ReportsOverviewResponse {
  videos: VideoRecord[];
  selectedVideo: VideoRecord | null;
  baseline: VideoSnapshot | null;
  latest: VideoSnapshot | null;
  snapshots: VideoSnapshot[];
  activities: Array<{
    id: number;
    campaign_ref: string;
    campaign_title: string;
    summary: string;
    details: string;
    created_at: string;
  }>;
  attributionDisclaimer: string;
}

export const ReportsView: React.FC<{ selectedVideoId: number | null; onSelectVideo: (id: number) => void }> = ({
  selectedVideoId,
  onSelectVideo,
}) => {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [data, setData] = useState<ReportsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ range });
    if (selectedVideoId) qs.set('videoId', String(selectedVideoId));
    api
      .get<ReportsOverviewResponse>(`/api/reports/overview?${qs.toString()}`)
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Could not load performance report.'))
      .finally(() => setLoading(false));
  }, [range, selectedVideoId]);

  if (loading && !data) {
    return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">{error}</div>
    );
  }

  if (!data || !data.selectedVideo) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-xl mx-auto">
        <h1 className="text-xl font-bold text-slate-900">Performance Reports</h1>
        <p className="text-sm text-slate-500 mt-2">
          Submit a YouTube video to start capturing baseline and periodic snapshots for downloadable reporting.
        </p>
      </div>
    );
  }

  const baseViews = data.baseline?.view_count ?? null;
  const latestViews = data.latest?.view_count ?? null;
  const viewsDelta = baseViews !== null && latestViews !== null ? latestViews - baseViews : null;

  const baseLikes = data.baseline?.like_count ?? null;
  const latestLikes = data.latest?.like_count ?? null;
  const likesDelta = baseLikes !== null && latestLikes !== null ? latestLikes - baseLikes : null;

  const baseSubs = data.baseline?.subscriber_count ?? null;
  const latestSubs = data.latest?.subscriber_count ?? null;
  const subsDelta = baseSubs !== null && latestSubs !== null ? latestSubs - baseSubs : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Performance Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Baseline comparisons, historical snapshots, and downloadable CSV / JSON exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter report by video"
            value={data.selectedVideo.id}
            onChange={(e) => onSelectVideo(Number(e.target.value))}
            className="min-h-[44px] max-w-xs px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
          >
            {data.videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              downloadAuthorizedFile(
                `/api/reports/export?format=csv&videoId=${data.selectedVideo!.id}`,
                'vantage-reach-performance-report.csv'
              ).catch((err) => setError(err.message))
            }
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-blue-700" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() =>
              downloadAuthorizedFile(
                `/api/reports/export?format=json&videoId=${data.selectedVideo!.id}`,
                'vantage-reach-performance-report.json'
              ).catch((err) => setError(err.message))
            }
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Date Range Segmented Filter */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        {(['7d', '30d', '90d', 'all'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold uppercase transition-colors ${
              range === r ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Measured Delta KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Views Change</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {viewsDelta !== null ? `${viewsDelta >= 0 ? '+' : ''}${formatCount(viewsDelta)}` : 'Unavailable'}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            <Lock className="w-3 h-3 inline mr-1" />
            Base {formatCount(baseViews)} → Latest {formatCount(latestViews)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Engagement (Likes) Change</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {likesDelta !== null ? `${likesDelta >= 0 ? '+' : ''}${formatCount(likesDelta)}` : 'Unavailable'}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            Base {formatCount(baseLikes)} → Latest {formatCount(latestLikes)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Channel Subscribers Change</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {data.latest?.subscribers_hidden
              ? 'Hidden'
              : subsDelta !== null
                ? `${subsDelta >= 0 ? '+' : ''}${formatCount(subsDelta)}`
                : 'Unavailable'}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {data.latest?.subscribers_hidden
              ? 'Channel hides subscriber count'
              : `Base ${formatCount(baseSubs)} → Latest ${formatCount(latestSubs)}`}
          </p>
        </div>
      </div>

      {/* Historical Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <SnapshotLineChart snapshots={data.snapshots} metric="view_count" label="Public Views" />
      </div>

      {/* Attribution Disclaimer */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-2.5 text-xs text-blue-950 leading-relaxed">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <span>{data.attributionDisclaimer}</span>
      </div>

      {/* Campaign Activity History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Campaign Activity History</h2>
        {data.activities.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No promotion campaign activities recorded for this video yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.activities.map((a) => (
              <div key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">
                    {a.summary} · <span className="font-mono text-slate-500">{a.campaign_ref}</span>
                  </p>
                  {a.details && <p className="text-slate-600 mt-0.5">{a.details}</p>}
                </div>
                <span className="text-slate-400 shrink-0">{formatDateTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileText,
  Info,
  KeyRound,
  Lightbulb,
  Lock,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  Type as TypeIcon,
} from 'lucide-react';
import { api, ApiError, formatCompact, formatCount, formatDate, formatDateTime } from '../lib/api';
import type {
  CompetitorResultRecord,
  SeoAnalysisRecord,
  SeoAssessmentStatus,
  VideoRecord,
  VideoSnapshot,
} from '../types';
import { ThumbnailImage } from './BrandMark';
import { SnapshotLineChart } from './Charts';

interface VideoIntelligenceViewProps {
  selectedVideoId: number | null;
  onSelectVideo: (id: number) => void;
  onNavigate: (tab: string, videoId?: number) => void;
}

interface VideoDetailResponse {
  video: VideoRecord;
  baseline: VideoSnapshot | null;
  latest: VideoSnapshot | null;
  delta: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    subscribers: number | null;
  };
  snapshots: VideoSnapshot[];
  seoAnalyses: SeoAnalysisRecord[];
  competitors: CompetitorResultRecord[];
}

function getAssessmentBadgeStyle(status?: SeoAssessmentStatus | string) {
  switch (status) {
    case 'Good':
      return {
        label: 'Good',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
        icon: CheckCircle2,
      };
    case 'Needs improvement':
      return {
        label: 'Needs improvement',
        className: 'bg-amber-50 text-amber-700 border border-amber-200/80',
        icon: AlertTriangle,
      };
    default:
      return {
        label: 'Opportunity detected',
        className: 'bg-blue-50 text-[#2563EB] border border-blue-200/80',
        icon: Sparkles,
      };
  }
}

export const VideoIntelligenceView: React.FC<VideoIntelligenceViewProps> = ({
  selectedVideoId,
  onSelectVideo,
  onNavigate,
}) => {
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [detail, setDetail] = useState<VideoDetailResponse | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(null);

  const [metric, setMetric] = useState<'view_count' | 'like_count' | 'subscriber_count'>('view_count');
  const [showSnapshotHistory, setShowSnapshotHistory] = useState(false);

  const [targetAudience, setTargetAudience] = useState('International YouTube viewers');
  const [searchPhraseInput, setSearchPhraseInput] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [searchingCompetitors, setSearchingCompetitors] = useState(false);
  const [savingAnalysis, setSavingAnalysis] = useState(false);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [competitorError, setCompetitorError] = useState<{ message: string; code?: string } | null>(null);

  const loadListAndDetail = async (targetId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const listRes = await api.get<{ videos: VideoRecord[] }>('/api/videos');
      setVideos(listRes.videos || []);
      const idToLoad = targetId || selectedVideoId || listRes.videos[0]?.id;
      if (idToLoad) {
        if (idToLoad !== selectedVideoId) onSelectVideo(idToLoad);
        const det = await api.get<VideoDetailResponse>(`/api/videos/${idToLoad}`);
        setDetail(det);
        setSelectedAnalysisId(det.seoAnalyses?.[0]?.id ?? null);
        setSearchPhraseInput((prev) => prev || det.video.title.split(' ').slice(0, 5).join(' '));
      } else {
        setDetail(null);
      }
    } catch (err: any) {
      setError({ message: err.message || 'Unable to load video intelligence.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCompetitorError(null);
    setNotice('');
    loadListAndDetail(selectedVideoId || undefined);
  }, [selectedVideoId]);

  const activeAnalysis = useMemo(() => {
    if (!detail?.seoAnalyses?.length) return null;
    return detail.seoAnalyses.find((a) => a.id === selectedAnalysisId) || detail.seoAnalyses[0];
  }, [detail, selectedAnalysisId]);

  const handleRefreshStats = async () => {
    if (!detail) return;
    setRefreshing(true);
    setError(null);
    setNotice('');
    try {
      const res = await api.post<{ ok: boolean; apiNotice?: string }>(`/api/videos/${detail.video.id}/refresh`);
      setNotice(res.apiNotice || 'Live snapshot synced. Your original baseline remains unchanged.');
      await loadListAndDetail(detail.video.id);
    } catch (err: any) {
      setError({
        message: err.message || 'Could not refresh live YouTube stats.',
        code: err instanceof ApiError ? err.code : undefined,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleRunGeminiAnalysis = async () => {
    if (!detail) return;
    setAnalyzingAi(true);
    setError(null);
    setNotice('');
    try {
      const phrases = searchPhraseInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.post<{ analysis: SeoAnalysisRecord }>(
        `/api/videos/${detail.video.id}/seo/analyze`,
        {
          videoTopic: detail.video.title,
          targetAudience,
          searchPhrases: phrases,
        }
      );
      await loadListAndDetail(detail.video.id);
      if (res.analysis?.id) setSelectedAnalysisId(res.analysis.id);
      setNotice('Gemini SEO analysis completed and saved to your video record.');
    } catch (err: any) {
      setError({
        message: err.message || 'Gemini SEO analysis could not be completed.',
        code: err instanceof ApiError ? err.code : undefined,
      });
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleFetchCompetitors = async () => {
    if (!detail) return;
    setSearchingCompetitors(true);
    setCompetitorError(null);
    try {
      const phrases = (searchPhraseInput || detail.video.title.split(' ').slice(0, 5).join(' '))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.post<{ results: CompetitorResultRecord[] }>(
        `/api/videos/${detail.video.id}/competitors/search`,
        { searchPhrases: phrases }
      );
      await loadListAndDetail(detail.video.id);
      setNotice(`Retrieved ${res.results.length} live YouTube search results for competitor comparison.`);
    } catch (err: any) {
      setCompetitorError({
        message: err.message || 'Unable to fetch YouTube search competitors.',
        code: err instanceof ApiError ? err.code : undefined,
      });
    } finally {
      setSearchingCompetitors(false);
    }
  };

  const handleSaveAnalysis = async () => {
    if (!activeAnalysis) return;
    setSavingAnalysis(true);
    try {
      await api.post(`/api/seo/${activeAnalysis.id}/save`);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              seoAnalyses: prev.seoAnalyses.map((a) =>
                a.id === activeAnalysis.id ? { ...a, saved_by_user: 1 } : a
              ),
            }
          : prev
      );
      setNotice('SEO analysis pinned to your saved account recommendations.');
    } catch (err: any) {
      setError({ message: err.message || 'Could not save analysis.' });
    } finally {
      setSavingAnalysis(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-9 w-52 rounded-lg bg-slate-100" />
        <div className="h-44 rounded-2xl bg-slate-100" />
        <div className="h-56 rounded-2xl bg-slate-100" />
        <div className="h-40 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="min-h-[44px] px-3 -ml-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <h1 className="text-xl font-extrabold text-slate-900">Video Intelligence</h1>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-7 sm:p-10 text-center max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-[#2563EB] mx-auto flex items-center justify-center">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-4">No videos analysed yet</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Submit a YouTube video first to lock its immutable baseline stats and unlock Gemini SEO Intelligence and competitor research.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('submit')}
            className="mt-5 min-h-[48px] px-6 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold shadow-md shadow-blue-600/20"
          >
            Submit a YouTube Video
          </button>
        </div>
      </div>
    );
  }

  const formatDelta = (d: number | null) => {
    if (d === null || !Number.isFinite(d)) return 'Unavailable';
    const sign = d > 0 ? '+' : '';
    return `${sign}${formatCount(d)}`;
  };

  // Derive section data cleanly from saved Gemini analysis (with backwards-compatible fallback for older rows)
  const sa = activeAnalysis?.structuredAssessment || null;
  const currentTitleWords = (detail?.video.title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  const titleKeywordsFound =
    sa?.titleKeywordsFound && sa.titleKeywordsFound.length > 0
      ? sa.titleKeywordsFound
      : (activeAnalysis?.keywords || [])
          .map((k) => k.keyword_text)
          .filter((kw) => currentTitleWords.some((w) => kw.toLowerCase().includes(w)))
          .slice(0, 5);

  const titleImprovements =
    sa?.titleImprovements && sa.titleImprovements.length > 0
      ? sa.titleImprovements
      : activeAnalysis?.title_clarity_notes
        ? [activeAnalysis.title_clarity_notes]
        : [];

  const descriptionKeywordsPresent = sa?.descriptionKeywordsPresent || [];
  const descriptionMissingKeywords = sa?.descriptionMissingKeywords || [];
  const descriptionImprovements =
    sa?.descriptionImprovements && sa.descriptionImprovements.length > 0
      ? sa.descriptionImprovements
      : activeAnalysis?.description_structure_notes
        ? [activeAnalysis.description_structure_notes]
        : [];

  const assessmentItems = activeAnalysis
    ? [
        {
          title: 'Title optimization',
          status: sa?.assessmentAreas?.titleOptimization?.status || 'Opportunity detected',
          explanation:
            sa?.assessmentAreas?.titleOptimization?.explanation || activeAnalysis.title_clarity_notes,
        },
        {
          title: 'Keyword relevance',
          status: sa?.assessmentAreas?.keywordRelevance?.status || 'Opportunity detected',
          explanation:
            sa?.assessmentAreas?.keywordRelevance?.explanation || activeAnalysis.topic_assessment,
        },
        {
          title: 'Description quality',
          status: sa?.assessmentAreas?.descriptionQuality?.status || 'Needs improvement',
          explanation:
            sa?.assessmentAreas?.descriptionQuality?.explanation || activeAnalysis.description_structure_notes,
        },
        {
          title: 'Search intent alignment',
          status: sa?.assessmentAreas?.searchIntentAlignment?.status || 'Good',
          explanation:
            sa?.assessmentAreas?.searchIntentAlignment?.explanation || activeAnalysis.search_intent,
        },
        {
          title: 'Content positioning',
          status: sa?.assessmentAreas?.contentPositioning?.status || 'Opportunity detected',
          explanation:
            sa?.assessmentAreas?.contentPositioning?.explanation || activeAnalysis.topic_assessment,
        },
      ]
    : [];

  const primaryKeywords = (activeAnalysis?.keywords || []).filter((k) => k.category === 'main');
  const secondaryKeywords = (activeAnalysis?.keywords || []).filter((k) => k.category === 'related');
  const longTailKeywords = (activeAnalysis?.keywords || []).filter((k) => k.category === 'long_tail');
  const relatedSearchPhrases =
    sa?.relatedSearchPhrases && sa.relatedSearchPhrases.length > 0
      ? sa.relatedSearchPhrases
      : (activeAnalysis?.searchPhrases || []).map((phrase) => ({
          phrase,
          rationale: 'Search phrase selected for competitor and viewer-intent alignment.',
        }));

  const overallBadge = getAssessmentBadgeStyle(sa?.overallStatus || 'Opportunity detected');
  const OverallIcon = overallBadge.icon;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* HEADER — Back Navigation, Page Title, Video Switcher & Snapshot Sync */}
      <section className="space-y-3 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              aria-label="Back to Home Dashboard"
              className="min-h-[44px] min-w-[44px] -ml-2 rounded-xl text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-[22px] sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight truncate">
                Video Intelligence
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 truncate">
                Metadata baseline, SEO insights &amp; search discovery analysis
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={refreshing || !detail}
            onClick={handleRefreshStats}
            className="min-h-[42px] px-3 sm:px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#2563EB] ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refreshing ? 'Syncing...' : 'Refresh Stats'}</span>
            <span className="sm:hidden">{refreshing ? 'Sync...' : 'Sync'}</span>
          </button>
        </div>

        {videos.length > 1 && (
          <div className="flex items-center gap-2">
            <select
              aria-label="Select submitted video"
              value={detail?.video.id || ''}
              onChange={(e) => onSelectVideo(Number(e.target.value))}
              className="w-full sm:max-w-md min-h-[44px] px-3.5 rounded-2xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-800"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className={`rounded-2xl border p-4 flex items-start gap-3 ${
            error.code === 'GEMINI_API_KEY_MISSING' || error.code === 'YOUTUBE_API_KEY_MISSING'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {error.code === 'GEMINI_API_KEY_MISSING' || error.code === 'YOUTUBE_API_KEY_MISSING' ? (
            <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs leading-relaxed">
            <p className="font-bold">
              {error.code === 'GEMINI_API_KEY_MISSING'
                ? 'Gemini API Configuration Required'
                : error.code === 'YOUTUBE_API_KEY_MISSING'
                  ? 'YouTube API Configuration Required'
                  : 'Action Could Not Be Completed'}
            </p>
            <p className="mt-0.5">{error.message}</p>
          </div>
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-[#1D4ED8]">
          {notice}
        </div>
      )}

      {detail && (
        <>
          {/* SECTION 1 — DETECTED VIDEO */}
          <section
            aria-label="Detected Video Information"
            className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Video successfully detected</span>
              </span>
              <span className="text-[11px] text-slate-400">
                Synced {formatDateTime(detail.video.last_synced_at)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-5 aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                <ThumbnailImage src={detail.video.thumbnail_url} alt={detail.video.title} />
              </div>

              <div className="md:col-span-7 space-y-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {detail.video.title}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{detail.video.channel_name}</span>
                    {detail.video.published_at && (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Published {formatDate(detail.video.published_at)}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Current Public Views vs Immutable Baseline Views */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Current Public Views</span>
                      <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums mt-1">
                      {formatCount(detail.latest?.view_count ?? detail.video.latest_views)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Baseline Views</span>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums mt-1">
                      {formatCount(detail.baseline?.view_count)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {detail.baseline?.captured_at ? formatDate(detail.baseline.captured_at) : 'Initial snapshot'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Expandable Snapshot Trend & Metrics Comparison */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSnapshotHistory((s) => !s)}
                className="w-full min-h-[40px] flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-[#2563EB]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#2563EB]" />
                  <span>
                    Baseline &amp; Snapshot History ({detail.snapshots.length}{' '}
                    {detail.snapshots.length === 1 ? 'snapshot' : 'snapshots'})
                  </span>
                </span>
                {showSnapshotHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showSnapshotHistory && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    {[
                      { label: 'Views Δ', val: formatDelta(detail.delta.views) },
                      { label: 'Likes', val: formatCount(detail.latest?.like_count) },
                      { label: 'Comments', val: formatCount(detail.latest?.comment_count) },
                      {
                        label: 'Subscribers',
                        val: detail.latest?.subscribers_hidden
                          ? 'Hidden'
                          : formatCount(detail.latest?.subscriber_count),
                      },
                    ].map((m) => (
                      <div key={m.label} className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                        <span className="text-[11px] text-slate-500 block">{m.label}</span>
                        <strong className="text-sm text-slate-900 tabular-nums">{m.val}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
                    {[
                      { id: 'view_count' as const, label: 'Views' },
                      { id: 'like_count' as const, label: 'Likes' },
                      { id: 'subscriber_count' as const, label: 'Subscribers' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMetric(m.id)}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                          metric === m.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <SnapshotLineChart
                    snapshots={detail.snapshots}
                    metric={metric}
                    label={
                      metric === 'view_count'
                        ? 'Public Views'
                        : metric === 'like_count'
                          ? 'Public Likes'
                          : 'Channel Subscribers'
                    }
                  />
                </div>
              )}
            </div>
          </section>

          {/* GEMINI ANALYSIS RUNNER / HISTORY SWITCHER */}
          <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#2563EB]" />
                  <span>Gemini AI Video Intelligence</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Uses your retrieved YouTube metadata{detail.competitors.length > 0 ? ' and live competitor data' : ''}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {detail.seoAnalyses.length > 1 && (
                  <select
                    aria-label="Revisit saved SEO analysis"
                    value={activeAnalysis?.id || ''}
                    onChange={(e) => setSelectedAnalysisId(Number(e.target.value))}
                    className="min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
                  >
                    {detail.seoAnalyses.map((a, idx) => (
                      <option key={a.id} value={a.id}>
                        {idx === 0 ? 'Latest: ' : ''}
                        {formatDateTime(a.created_at)}
                      </option>
                    ))}
                  </select>
                )}

                {activeAnalysis && (
                  <button
                    type="button"
                    disabled={savingAnalysis || activeAnalysis.saved_by_user === 1}
                    onClick={handleSaveAnalysis}
                    className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      activeAnalysis.saved_by_user === 1
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    <span>{activeAnalysis.saved_by_user === 1 ? 'Saved' : 'Save Analysis'}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={analyzingAi}
                  onClick={handleRunGeminiAnalysis}
                  className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-blue-600/20 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {analyzingAi
                      ? 'Analysing with Gemini...'
                      : activeAnalysis
                        ? 'Re-run SEO Analysis'
                        : 'Run Gemini SEO Analysis'}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label htmlFor="vi-target-audience" className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Intended Audience
                </label>
                <input
                  id="vi-target-audience"
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="vi-search-phrases" className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Search Phrases (comma-separated)
                </label>
                <input
                  id="vi-search-phrases"
                  type="text"
                  value={searchPhraseInput}
                  onChange={(e) => setSearchPhraseInput(e.target.value)}
                  placeholder="e.g. youtube seo tips, grow channel"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Loading Skeleton while Gemini runs */}
          {analyzingAi && (
            <div className="space-y-4 animate-pulse">
              <div className="h-52 rounded-2xl bg-slate-100" />
              <div className="h-40 rounded-2xl bg-slate-100" />
              <div className="h-40 rounded-2xl bg-slate-100" />
            </div>
          )}

          {/* Empty State if no Gemini analysis generated yet */}
          {!analyzingAi && !activeAnalysis && (
            <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-6 sm:p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-[#2563EB] mx-auto flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-3">Ready to Analyse Your Video</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                Click <strong>Run Gemini SEO Analysis</strong> above to evaluate your title, description, search intent alignment, and keyword opportunities using real retrieved metadata.
              </p>
            </section>
          )}

          {/* SECTIONS 2–7 WHEN GEMINI SEO ANALYSIS EXISTS */}
          {!analyzingAi && activeAnalysis && (
            <>
              {/* SECTION 2 — SEO OVERVIEW */}
              <section
                aria-label="SEO Overview"
                className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-[#2563EB]">AI-Assisted Assessment · {activeAnalysis.model_used}</p>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">SEO Overview</h2>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${overallBadge.className}`}
                  >
                    <OverallIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{overallBadge.label}</span>
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {sa?.overallSummary || activeAnalysis.topic_assessment}
                </p>

                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {assessmentItems.map((area) => {
                    const badge = getAssessmentBadgeStyle(area.status);
                    const StatusIcon = badge.icon;
                    return (
                      <div key={area.title} className="py-3 first:pt-3 last:pb-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900">{area.title}</h3>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${badge.className}`}
                          >
                            <StatusIcon className="w-3 h-3 shrink-0" />
                            <span>{badge.label}</span>
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{area.explanation}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex items-start gap-2.5 text-[11.5px] text-slate-600 leading-relaxed">
                  <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                  <p>
                    <strong className="text-slate-800">Actual Data vs. AI Guidance:</strong> Video counts and competitor views come directly from YouTube Data API v3. Qualitative assessments above are generated by Gemini based on metadata clarity and viewer intent—Vantage Reach does not claim access to YouTube&apos;s internal ranking algorithm.
                  </p>
                </div>
              </section>

              {/* SECTION 3 — TITLE ANALYSIS */}
              <section
                aria-label="Title Analysis"
                className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                    <TypeIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Title Analysis</h2>
                    <p className="text-xs text-slate-500">Clarity, topic focus &amp; keyword alignment</p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 space-y-2">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 block">Current Video Title</span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.video.title}</p>
                  </div>
                  <div className="pt-2 border-t border-slate-200/70">
                    <span className="text-[11px] font-semibold text-slate-500 block">Main Topic Identified</span>
                    <p className="text-xs font-semibold text-[#2563EB] mt-0.5">{activeAnalysis.main_keyword}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-800 mb-1.5">Relevant Keywords Found</h3>
                  {titleKeywordsFound.length === 0 ? (
                    <p className="text-xs text-slate-500">No strong focus keywords detected in the current title yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {titleKeywordsFound.map((kw, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#1D4ED8] text-xs font-medium"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-800 mb-1.5">Suggestions for Improvement</h3>
                  <ul className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                    {titleImprovements.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#2563EB] font-bold">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('seo', detail.video.id)}
                  className="w-full sm:w-auto min-h-[46px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Improve My Title</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </section>

              {/* SECTION 4 — DESCRIPTION ANALYSIS */}
              <section
                aria-label="Description Analysis"
                className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Description Analysis</h2>
                    <p className="text-xs text-slate-500">Structure, context &amp; missing keyword opportunities</p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                  <span className="text-[11px] font-semibold text-slate-500 block">Description Quality Assessment</span>
                  <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                    {sa?.assessmentAreas?.descriptionQuality?.explanation || activeAnalysis.description_structure_notes}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200/80 p-3">
                    <h3 className="text-xs font-bold text-slate-800 mb-1.5">Keywords Already Present</h3>
                    {descriptionKeywordsPresent.length === 0 ? (
                      <p className="text-xs text-slate-500">Few or no target keywords found in current description.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {descriptionKeywordsPresent.map((kw, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-medium"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200/80 p-3">
                    <h3 className="text-xs font-bold text-slate-800 mb-1.5">Missing Keyword Opportunities</h3>
                    {descriptionMissingKeywords.length === 0 ? (
                      <p className="text-xs text-slate-500">See keyword opportunities below to enrich opening lines.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {descriptionMissingKeywords.map((kw, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-medium"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-800 mb-1.5">Suggestions for Improvement</h3>
                  <ul className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                    {descriptionImprovements.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#2563EB] font-bold">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('seo', detail.video.id)}
                  className="w-full sm:w-auto min-h-[46px] px-5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-xs sm:text-sm font-semibold text-slate-900 hover:text-[#2563EB] inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Optimize My Description</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </section>

              {/* SECTION 5 — KEYWORD OPPORTUNITIES */}
              <section
                aria-label="Keyword Opportunities"
                className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Keyword Opportunities</h2>
                    <p className="text-xs text-slate-500">AI-recommended relevance groups (no invented volume estimates)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Primary Keywords */}
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3.5 space-y-2">
                    <h3 className="text-xs font-bold text-slate-900">Primary Keywords</h3>
                    {(primaryKeywords.length > 0
                      ? primaryKeywords
                      : [{ id: 0, keyword_text: activeAnalysis.main_keyword, rationale: sa?.primaryKeywordRationale || 'Primary focus topic keyword.' }]
                    ).map((k, idx) => (
                      <div key={idx} className="rounded-lg bg-white border border-slate-200/70 p-2.5">
                        <p className="text-xs font-bold text-[#2563EB]">{k.keyword_text}</p>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{k.rationale}</p>
                      </div>
                    ))}
                  </div>

                  {/* Secondary Keywords */}
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3.5 space-y-2">
                    <h3 className="text-xs font-bold text-slate-900">Secondary Keywords</h3>
                    {secondaryKeywords.length === 0 ? (
                      <p className="text-xs text-slate-500">Re-run SEO analysis to populate secondary keywords.</p>
                    ) : (
                      secondaryKeywords.map((k) => (
                        <div key={k.id} className="rounded-lg bg-white border border-slate-200/70 p-2.5">
                          <p className="text-xs font-bold text-slate-900">{k.keyword_text}</p>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{k.rationale}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Long-tail Keywords */}
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3.5 space-y-2">
                    <h3 className="text-xs font-bold text-slate-900">Long-Tail Keywords</h3>
                    {longTailKeywords.length === 0 ? (
                      <p className="text-xs text-slate-500">No long-tail keywords stored in this snapshot.</p>
                    ) : (
                      longTailKeywords.map((k) => (
                        <div key={k.id} className="rounded-lg bg-white border border-slate-200/70 p-2.5">
                          <p className="text-xs font-bold text-slate-900">{k.keyword_text}</p>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{k.rationale}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Related Search Phrases */}
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3.5 space-y-2">
                    <h3 className="text-xs font-bold text-slate-900">Related Search Phrases</h3>
                    {relatedSearchPhrases.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Add custom search phrases above or run Competitor Research to capture search phrases.
                      </p>
                    ) : (
                      relatedSearchPhrases.map((p, idx) => (
                        <div key={idx} className="rounded-lg bg-white border border-slate-200/70 p-2.5">
                          <p className="text-xs font-bold text-slate-900">{p.phrase}</p>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{p.rationale}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* SECTION 6 — COMPETITOR INSIGHTS (Real YouTube Data API v3 Results) */}
          <section
            aria-label="Competitor Insights"
            className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Competitor Insights</h2>
                  <p className="text-xs text-slate-500">Real YouTube search results for comparison</p>
                </div>
              </div>

              <button
                type="button"
                disabled={searchingCompetitors}
                onClick={handleFetchCompetitors}
                className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-xs font-semibold text-slate-800 hover:text-[#2563EB] inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${searchingCompetitors ? 'animate-spin' : ''}`} />
                <span>{searchingCompetitors ? 'Searching...' : 'Fetch Live Competitors'}</span>
              </button>
            </div>

            {competitorError && (
              <div
                role="alert"
                className={`rounded-xl border p-3.5 flex items-start gap-2.5 text-xs ${
                  competitorError.code === 'YOUTUBE_API_KEY_MISSING'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    {competitorError.code === 'YOUTUBE_API_KEY_MISSING'
                      ? 'YouTube Data API Configuration Missing'
                      : 'Competitor Search Failed'}
                  </p>
                  <p className="mt-0.5">{competitorError.message}</p>
                </div>
              </div>
            )}

            {detail.competitors.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
                <p className="text-xs font-semibold text-slate-800">No competitor search results retrieved yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tap <strong>Fetch Live Competitors</strong> or open Competitor Research to inspect real YouTube videos matching your search phrase.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.competitors.slice(0, 4).map((c, idx) => (
                  <div key={`${c.competitor_video_id}-${idx}`} className="py-3 first:pt-1 last:pb-1 flex items-center gap-3">
                    <div className="w-24 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/70 shrink-0">
                      <ThumbnailImage
                        src={c.thumbnail_url || c.thumbnailUrl}
                        alt={c.title}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                        {c.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        {c.channel_name || c.channelName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="w-3 h-3 text-slate-400" />
                          <span>{formatCompact(c.view_count ?? c.viewCount)} views</span>
                        </span>
                        {(c.published_at || c.publishedAt) && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formatDate(c.published_at || c.publishedAt)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => onNavigate('seo', detail.video.id)}
              className="w-full sm:w-auto min-h-[46px] px-5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-xs sm:text-sm font-semibold text-slate-900 hover:text-[#2563EB] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <span>View Competitor Research</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </section>

          {/* SECTION 7 — RECOMMENDED ACTIONS */}
          {activeAnalysis && (
            <section
              aria-label="Recommended Actions"
              className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-3.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Recommended Actions</h2>
                  <p className="text-xs text-slate-500">Practical next steps to strengthen video discoverability</p>
                </div>
              </div>

              <div className="space-y-2">
                {activeAnalysis.contentRecommendations.map((rec, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onNavigate('seo', detail.video.id)}
                    className="w-full rounded-xl bg-slate-50/80 hover:bg-blue-50/70 border border-slate-200/70 hover:border-blue-200 p-3 flex items-start justify-between gap-3 text-left transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-[13px] font-medium text-slate-700 leading-snug">
                        {rec}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </button>
                ))}

                {activeAnalysis.thumbnail_suitability_notes && (
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-3 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600 leading-relaxed">
                      <strong className="text-slate-900 block">Thumbnail Clarity Guidance</strong>
                      <span>{activeAnalysis.thumbnail_suitability_notes}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* SECTION 8 — NEXT ACTIONS */}
          <section aria-label="Next Actions" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('seo', detail.video.id)}
              className="min-h-[52px] px-6 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold shadow-md shadow-blue-600/20 inline-flex items-center justify-center gap-2 transition-all"
            >
              <Rocket className="w-4 h-4" />
              <span>Optimize My Video</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('reports', detail.video.id)}
              className="min-h-[52px] px-6 rounded-2xl bg-white hover:bg-blue-50 border border-blue-200 text-[#2563EB] text-sm font-semibold shadow-[0_2px_10px_rgba(15,23,42,0.04)] inline-flex items-center justify-center gap-2 transition-all"
            >
              <FileText className="w-4 h-4" />
              <span>View Full SEO Report</span>
            </button>
          </section>
        </>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookmarkCheck,
  Check,
  Copy,
  Globe,
  Search,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { api, formatCompact, formatDate } from '../lib/api';
import type { CompetitorResultRecord, SeoAnalysisRecord, VideoRecord } from '../types';
import { ThumbnailImage } from './BrandMark';

interface SeoAndCompetitorsViewProps {
  selectedVideoId: number | null;
  onSelectVideo: (id: number) => void;
  onNavigate: (tab: string, videoId?: number) => void;
}

export const SeoAndCompetitorsView: React.FC<SeoAndCompetitorsViewProps> = ({
  selectedVideoId,
  onSelectVideo,
  onNavigate,
}) => {
  const [subTab, setSubTab] = useState<'optimizer' | 'competitors'>('optimizer');
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [activeVideo, setActiveVideo] = useState<VideoRecord | null>(null);
  const [analyses, setAnalyses] = useState<SeoAnalysisRecord[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorResultRecord[]>([]);

  // Form inputs
  const [videoTopic, setVideoTopic] = useState('');
  const [targetAudience, setTargetAudience] = useState('International YouTube creators and learners');
  const [phraseInput, setPhraseInput] = useState('');
  const [compDisclaimer, setCompDisclaimer] = useState(
    'YouTube search results vary by viewer location, personalization, language, and time. API search positions are unpersonalized snapshots and do not represent universal rankings.'
  );

  const [loading, setLoading] = useState(true);
  const [runningAi, setRunningAi] = useState(false);
  const [searchingComp, setSearchingComp] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = async (vidId?: number) => {
    setLoading(true);
    setError('');
    try {
      const list = await api.get<{ videos: VideoRecord[] }>('/api/videos');
      setVideos(list.videos);
      const target = vidId || selectedVideoId || list.videos[0]?.id;
      if (target) {
        if (target !== selectedVideoId) onSelectVideo(target);
        const det = await api.get<{
          video: VideoRecord;
          seoAnalyses: SeoAnalysisRecord[];
          competitors: CompetitorResultRecord[];
        }>(`/api/videos/${target}`);
        setActiveVideo(det.video);
        setAnalyses(det.seoAnalyses || []);
        setCompetitors(det.competitors || []);
        if (!videoTopic) setVideoTopic(det.video.title);
        if (!phraseInput) setPhraseInput(det.video.title.split(' ').slice(0, 5).join(' '));
      } else {
        setActiveVideo(null);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load SEO workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedVideoId || undefined);
  }, [selectedVideoId]);

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      setError('Clipboard copy failed in this browser context.');
    }
  };

  const handleRunCompetitorSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVideo) return;
    setError('');
    setNotice('');
    setSearchingComp(true);
    try {
      const phrases = phraseInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.post<{ results: CompetitorResultRecord[]; disclaimer: string }>(
        `/api/videos/${activeVideo.id}/competitors/search`,
        { searchPhrases: phrases }
      );
      setCompDisclaimer(res.disclaimer);
      await loadData(activeVideo.id);
      setNotice(`Retrieved ${res.results.length} real YouTube Data API v3 search results.`);
    } catch (err: any) {
      setError(err.message || 'Competitor search failed.');
    } finally {
      setSearchingComp(false);
    }
  };

  const handleRunGeminiSeo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVideo) return;
    setError('');
    setNotice('');
    setRunningAi(true);
    try {
      const phrases = phraseInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await api.post(`/api/videos/${activeVideo.id}/seo/analyze`, {
        videoTopic: videoTopic || activeVideo.title,
        targetAudience,
        searchPhrases: phrases,
      });
      await loadData(activeVideo.id);
      setNotice('Gemini SEO analysis generated and schema-validated on server.');
    } catch (err: any) {
      setError(err.message || 'Gemini SEO analysis failed.');
    } finally {
      setRunningAi(false);
    }
  };

  const handleSaveAnalysis = async (analysisId: number) => {
    try {
      await api.post(`/api/seo/${analysisId}/save`);
      setAnalyses((prev) => prev.map((a) => (a.id === analysisId ? { ...a, saved_by_user: 1 } : a)));
      setNotice('SEO recommendations saved to your video record.');
    } catch (err: any) {
      setError(err.message || 'Could not save analysis.');
    }
  };

  if (loading && !activeVideo) {
    return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  }

  if (videos.length === 0 || !activeVideo) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-xl mx-auto">
        <h1 className="text-xl font-bold text-slate-900">YouTube SEO &amp; Competitor Intelligence</h1>
        <p className="text-sm text-slate-500 mt-2">
          Submit a YouTube video first so Gemini can analyze its title, description, thumbnail, and real search competitors.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('submit')}
          className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
        >
          Submit Video
        </button>
      </div>
    );
  }

  const latestAnalysis = analyses[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SEO &amp; Competitor Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            AI-generated optimization recommendations and live YouTube Data API v3 competitor benchmarking
          </p>
        </div>

        <select
          aria-label="Select video for SEO analysis"
          value={activeVideo.id}
          onChange={(e) => {
            const nextId = Number(e.target.value);
            const v = videos.find((x) => x.id === nextId);
            if (v) {
              setVideoTopic(v.title);
              setPhraseInput(v.title.split(' ').slice(0, 5).join(' '));
            }
            onSelectVideo(nextId);
          }}
          className="min-h-[44px] max-w-xs px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
        >
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        <button
          type="button"
          onClick={() => setSubTab('optimizer')}
          className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
            subTab === 'optimizer' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-blue-700" />
          <span>Gemini SEO Optimizer</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('competitors')}
          className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
            subTab === 'competitors' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Search className="w-4 h-4 text-blue-700" />
          <span>Competitor Research ({competitors.length})</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800">
          {notice}
        </div>
      )}

      {subTab === 'optimizer' && (
        <div className="space-y-6">
          <form onSubmit={handleRunGeminiSeo} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Generate Gemini SEO Recommendations</h2>
              <span className="text-xs text-slate-500">
                Measured input · AI-generated suggestions · Never auto-edits YouTube
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Video Topic</label>
                <input
                  type="text"
                  required
                  value={videoTopic}
                  onChange={(e) => setVideoTopic(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Target Audience</label>
                <input
                  type="text"
                  required
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Search Phrases (comma-separated)
              </label>
              <input
                type="text"
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
                placeholder="e.g. youtube seo tutorial, grow youtube channel 2026"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Uses {competitors.length} retrieved competitor rows and live public metrics when available.
              </p>
              <button
                type="submit"
                disabled={runningAi}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>{runningAi ? 'Analyzing with Gemini...' : 'Run Gemini SEO Analysis'}</span>
              </button>
            </div>
          </form>

          {latestAnalysis ? (
            <div className="space-y-5">
              {/* Header & Save / Purchase Actions */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-blue-700">
                    AI-Generated Recommendations · Model: {latestAnalysis.model_used}
                  </p>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    Main Keyword: {latestAnalysis.main_keyword}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Search Intent: {latestAnalysis.search_intent} · Generated {formatDate(latestAnalysis.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveAnalysis(latestAnalysis.id)}
                    className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap ${
                      latestAnalysis.saved_by_user
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    <span>{latestAnalysis.saved_by_user ? 'Saved' : 'Save Recommendations'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('plans', activeVideo.id)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Promote Video — $1</span>
                  </button>
                </div>
              </div>

              {/* Original vs Suggested Title Comparison */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Title Comparison &amp; Alternatives</h3>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-500">Current Original Title (Measured)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{activeVideo.title}</p>
                  <p className="text-xs text-slate-600 mt-1.5">{latestAnalysis.title_clarity_notes}</p>
                </div>

                <div className="space-y-3">
                  {latestAnalysis.titleAlternatives.map((alt, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900">{alt.title}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{alt.explanation}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(`title-${i}`, alt.title)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shrink-0"
                      >
                        {copiedKey === `title-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === `title-${i}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended Description & Hashtags */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Recommended Description</h3>
                    <button
                      type="button"
                      onClick={() => handleCopy('desc', latestAnalysis.recommended_description)}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                    >
                      {copiedKey === 'desc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'desc' ? 'Copied' : 'Copy Description'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">{latestAnalysis.description_structure_notes}</p>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-4 leading-relaxed">
                    {latestAnalysis.recommended_description}
                  </pre>
                  {latestAnalysis.hashtags.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-semibold text-slate-700 mb-1">Suggested Hashtags</p>
                      <p className="text-xs text-blue-700 font-mono">{latestAnalysis.hashtags.join(' ')}</p>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5 space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">Topic &amp; Thumbnail Assessment</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{latestAnalysis.topic_assessment}</p>
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-800">Thumbnail Suitability</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {latestAnalysis.thumbnail_suitability_notes}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">Keyword Opportunities</h3>
                    <div className="divide-y divide-slate-100">
                      {latestAnalysis.keywords.map((kw) => (
                        <div key={kw.id} className="py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">{kw.keyword_text}</span>
                            <span className="text-[11px] text-slate-500 capitalize">
                              {kw.category.replace('_', ' ')}
                            </span>
                          </div>
                          {kw.rationale && <p className="text-[11px] text-slate-500 mt-0.5">{kw.rationale}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Positioning & Limitations */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Content Positioning Advice &amp; Confidence Notes</h3>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-5">
                  {latestAnalysis.contentRecommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-600 leading-relaxed">
                  <strong className="text-slate-800">SEO Limitations &amp; Provenance:</strong>{' '}
                  {latestAnalysis.limitations_notes}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              Run Gemini SEO Analysis above to generate title alternatives, keyword opportunities, and a structured description for this video.
            </div>
          )}
        </div>
      )}

      {subTab === 'competitors' && (
        <div className="space-y-6">
          <form onSubmit={handleRunCompetitorSearch} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Search YouTube Competitors (Data API v3)</h2>
            <p className="text-xs text-slate-500">
              Enter up to 3 comma-separated search phrases to retrieve real competing videos and compare them against your submission.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                required
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
                placeholder="e.g. youtube seo guide, how to grow channel"
                className="flex-1 min-h-[48px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={searchingComp}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>{searchingComp ? 'Searching YouTube...' : 'Search Competitors'}</span>
              </button>
            </div>
          </form>

          {/* Creator Video Comparison Benchmark */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-20 h-12 rounded-lg overflow-hidden shrink-0 bg-white border border-slate-200">
                <ThumbnailImage src={activeVideo.thumbnail_url} alt={activeVideo.title} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-blue-700">Your Video Benchmark</p>
                <p className="text-sm font-bold text-slate-900 truncate">{activeVideo.title}</p>
                <p className="text-xs text-slate-500">
                  {activeVideo.channel_name} · {formatCompact(activeVideo.latest_views)} views
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-600 flex items-center gap-1.5 shrink-0">
              <Globe className="w-4 h-4 text-slate-400" />
              <span>API Search Snapshot</span>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 leading-relaxed">
            {compDisclaimer}
          </div>

          {competitors.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No competitor search results stored for this video yet. Run a search above to compare live YouTube results.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {competitors.map((c, idx) => {
                const pos = c.result_position ?? c.resultPosition ?? idx + 1;
                const views = c.view_count ?? c.viewCount;
                const phrase = c.search_phrase ?? c.searchPhrase ?? '';
                const channel = c.channel_name ?? c.channelName ?? '';
                const thumb = c.thumbnail_url ?? c.thumbnailUrl ?? '';
                const pub = c.published_at ?? c.publishedAt ?? '';

                return (
                  <div key={`${c.id || idx}-${phrase}`} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="w-7 text-center text-sm font-bold font-mono tabular-nums text-slate-500">
                        #{pos}
                      </span>
                      <div className="w-28 h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                        <ThumbnailImage src={thumb} alt={c.title} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 line-clamp-2">{c.title}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {channel} · Published {pub ? formatDate(pub) : '—'} · Phrase:{' '}
                        <span className="font-medium text-slate-700">"{phrase}"</span>
                      </p>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900">
                        {views !== null && views !== undefined ? `${formatCompact(views)} views` : 'Views unavailable'}
                      </p>
                      <p className="text-[11px] text-slate-500">API Position #{pos}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

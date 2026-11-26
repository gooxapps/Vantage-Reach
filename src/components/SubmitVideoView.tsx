import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardPaste,
  Eye,
  KeyRound,
  Link2,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Youtube,
} from 'lucide-react';
import { api, ApiError, formatCount, formatDate } from '../lib/api';
import type { VideoRecord } from '../types';
import { ThumbnailImage } from './BrandMark';

interface VideoPreview {
  youtubeVideoId: string;
  url: string;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  thumbnailUrl: string;
  duration: string;
  publishedAt: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  subscriberCount: number | null;
  subscribersHidden: boolean;
  statsSource: string;
  apiNotice?: string;
}

interface SubmitVideoViewProps {
  onSubmitted: (video: VideoRecord) => void;
}

type ErrorKind =
  | 'INVALID_URL'
  | 'UNSUPPORTED_LINK'
  | 'VIDEO_UNAVAILABLE'
  | 'YOUTUBE_API_KEY_MISSING'
  | 'YOUTUBE_API_ERROR'
  | 'GENERAL';

interface DetectionErrorState {
  kind: ErrorKind;
  title: string;
  message: string;
  existingVideoId?: number;
}

function classifyClientYouTubeUrl(rawUrl: string): { valid: boolean; error?: DetectionErrorState } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: {
        kind: 'INVALID_URL',
        title: 'Invalid YouTube URL',
        message: 'Please paste a YouTube video link before continuing.',
      },
    };
  }

  let parsed: URL;
  try {
    if (/\s/.test(trimmed)) throw new Error('whitespace');
    parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (!parsed.hostname.includes('.')) throw new Error('no domain');
  } catch {
    return {
      valid: false,
      error: {
        kind: 'INVALID_URL',
        title: 'Invalid URL Format',
        message: 'Please enter a valid link (for example, https://www.youtube.com/watch?v=...).',
      },
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || null;
  } else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (
      parsed.pathname.startsWith('/shorts/') ||
      parsed.pathname.startsWith('/embed/') ||
      parsed.pathname.startsWith('/live/')
    ) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] || null;
    } else {
      return {
        valid: false,
        error: {
          kind: 'UNSUPPORTED_LINK',
          title: 'Unsupported YouTube Link',
          message: 'Please paste a direct video link using youtube.com/watch?v=, youtu.be/, or youtube.com/shorts/.',
        },
      };
    }
  } else {
    return {
      valid: false,
      error: {
        kind: 'UNSUPPORTED_LINK',
        title: 'Unsupported Video Link',
        message: 'Only YouTube links (youtube.com/watch?v=, youtu.be/, or youtube.com/shorts/) are supported.',
      },
    };
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      valid: false,
      error: {
        kind: 'INVALID_URL',
        title: 'Invalid YouTube Video ID',
        message: 'Could not find a valid YouTube video ID in that link. Check the URL and try again.',
      },
    };
  }

  return { valid: true };
}

function mapServerError(err: unknown): DetectionErrorState {
  if (err instanceof ApiError) {
    const code = err.code;
    if (code === 'YOUTUBE_API_KEY_MISSING') {
      return {
        kind: 'YOUTUBE_API_KEY_MISSING',
        title: 'YouTube Data API Configuration Required',
        message:
          err.message ||
          'YouTube Data API v3 is not configured on the server. Add YOUTUBE_API_KEY or configure it in Admin Console → YouTube API.',
      };
    }
    if (code === 'UNSUPPORTED_LINK') {
      return {
        kind: 'UNSUPPORTED_LINK',
        title: 'Unsupported Video Link',
        message: err.message,
      };
    }
    if (code === 'INVALID_URL') {
      return {
        kind: 'INVALID_URL',
        title: 'Invalid YouTube URL',
        message: err.message,
      };
    }
    if (code === 'VIDEO_UNAVAILABLE' || err.status === 404) {
      return {
        kind: 'VIDEO_UNAVAILABLE',
        title: 'Video Unavailable',
        message: err.message || 'This YouTube video is private, deleted, or unavailable.',
      };
    }
    if (err.status === 409 && err.data?.existingVideoId) {
      return {
        kind: 'GENERAL',
        title: 'Baseline Already Recorded',
        message:
          err.message ||
          'This video has already been submitted. Open Video Analysis to review its immutable baseline and run optimization.',
        existingVideoId: Number(err.data.existingVideoId),
      };
    }
    return {
      kind: code === 'YOUTUBE_API_ERROR' ? 'YOUTUBE_API_ERROR' : 'GENERAL',
      title: code === 'YOUTUBE_API_ERROR' ? 'YouTube API Error' : 'Could Not Retrieve Video',
      message: err.message,
    };
  }

  return {
    kind: 'GENERAL',
    title: 'Request Failed',
    message: (err as any)?.message || 'Unable to retrieve YouTube video details right now.',
  };
}

export const SubmitVideoView: React.FC<SubmitVideoViewProps> = ({ onSubmitted }) => {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pasteHint, setPasteHint] = useState('');
  const [errorState, setErrorState] = useState<DetectionErrorState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePasteFromClipboard = async () => {
    setPasteHint('');
    setErrorState(null);
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setUrl(text.trim());
          setPreview(null);
          return;
        }
        setPasteHint('Clipboard is empty. Copy a YouTube link first or paste directly into the field.');
      } catch {
        setPasteHint('Browser blocked clipboard access — tap the input and paste manually.');
      }
    } else {
      setPasteHint('Tap the input and paste your YouTube link.');
    }
    inputRef.current?.focus();
  };

  const handleDetect = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasteHint('');
    setErrorState(null);
    setPreview(null);

    const precheck = classifyClientYouTubeUrl(url);
    if (!precheck.valid && precheck.error) {
      setErrorState(precheck.error);
      return;
    }

    setDetecting(true);
    try {
      const res = await api.post<{ preview: VideoPreview }>('/api/videos/detect', { url });
      setPreview(res.preview);
    } catch (err) {
      setErrorState(mapServerError(err));
    } finally {
      setDetecting(false);
    }
  };

  const handleContinue = async () => {
    if (!preview) return;
    setErrorState(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ video: VideoRecord }>('/api/videos', { url: preview.url });
      onSubmitted(res.video);
    } catch (err) {
      setErrorState(mapServerError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    {
      num: '1',
      icon: Link2,
      text: 'Paste your video link.',
    },
    {
      num: '2',
      icon: Search,
      text: 'We automatically retrieve your video information.',
    },
    {
      num: '3',
      icon: Sparkles,
      text: 'Get your video analysis and recommendations.',
    },
  ];

  const showSubscriberMetric =
    preview !== null && !preview.subscribersHidden && preview.subscriberCount !== null;

  return (
    <div className="space-y-4 sm:space-y-5 max-w-4xl mx-auto lg:mx-0">
      {/* Main Heading & Supporting Text */}
      <section className="pt-0.5">
        <h1 className="text-[26px] sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Submit Your YouTube Video
        </h1>
        <p className="text-[15px] text-slate-600 mt-1 leading-snug max-w-2xl">
          Paste your video link and let Vantage Reach discover opportunities to improve its visibility.
        </p>
      </section>

      {/* SECTION 1 — VIDEO LINK */}
      <section
        aria-label="YouTube Video Link"
        className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Youtube className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <label htmlFor="yt-url-input" className="block text-sm sm:text-base font-bold text-slate-900">
              YouTube Video URL
            </label>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Supports youtube.com/watch?v=, youtu.be/, and youtube.com/shorts/
            </p>
          </div>
        </div>

        <form onSubmit={handleDetect} noValidate className="space-y-3.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                id="yt-url-input"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errorState) setErrorState(null);
                  if (pasteHint) setPasteHint('');
                }}
                placeholder="Paste your YouTube video link here"
                className="w-full min-h-[52px] pl-10 pr-24 rounded-2xl border border-slate-200 bg-slate-50/80 text-sm sm:text-[15px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
              />

              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {url && (
                  <button
                    type="button"
                    onClick={() => {
                      setUrl('');
                      setPreview(null);
                      setErrorState(null);
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear URL"
                    className="min-h-[36px] min-w-[36px] rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="min-h-[36px] px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-[#2563EB] inline-flex items-center gap-1 shadow-2xs"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Paste</span>
                </button>
              </div>
            </div>
          </div>

          {pasteHint && <p className="text-xs text-slate-500">{pasteHint}</p>}

          {/* Error States */}
          {errorState && (
            <div
              role="alert"
              className={`rounded-2xl border p-4 flex items-start gap-3 ${
                errorState.kind === 'YOUTUBE_API_KEY_MISSING'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {errorState.kind === 'YOUTUBE_API_KEY_MISSING' ? (
                <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs sm:text-sm font-bold">{errorState.title}</p>
                <p className="text-xs leading-relaxed opacity-90">{errorState.message}</p>
                {errorState.existingVideoId && (
                  <button
                    type="button"
                    onClick={() => onSubmitted({ id: errorState.existingVideoId! } as VideoRecord)}
                    className="mt-2 min-h-[40px] px-4 rounded-xl bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1D4ED8] inline-flex items-center gap-1.5"
                  >
                    <span>Continue to Video Analysis</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={detecting}
            className="w-full min-h-[52px] px-6 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] disabled:opacity-60 text-white text-sm sm:text-[15px] font-semibold shadow-md shadow-blue-600/20 inline-flex items-center justify-center gap-2 transition-all"
          >
            <span>{detecting ? 'Detecting Video...' : 'Detect My Video'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </section>

      {/* Loading Skeleton State while retrieving YouTube details */}
      {detecting && (
        <section
          aria-label="Loading video preview"
          className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-6 space-y-4 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-44 rounded-lg bg-slate-100" />
            <div className="h-4 w-20 rounded-lg bg-slate-100" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 aspect-video rounded-2xl bg-slate-100" />
            <div className="md:col-span-7 space-y-3">
              <div className="h-5 w-4/5 rounded-lg bg-slate-100" />
              <div className="h-4 w-1/2 rounded-lg bg-slate-100" />
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="h-16 rounded-xl bg-slate-100" />
                <div className="h-16 rounded-xl bg-slate-100" />
              </div>
            </div>
          </div>
          <div className="h-12 rounded-2xl bg-blue-100/70" />
        </section>
      )}

      {/* Successful Video Detection Preview */}
      {!detecting && preview && (
        <section
          aria-label="Detected YouTube Video Preview"
          className="rounded-2xl bg-white border border-blue-200/80 shadow-[0_4px_16px_rgba(37,99,235,0.08)] overflow-hidden"
        >
          <div className="px-4 py-3.5 sm:px-6 sm:py-4 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Video Detected Successfully
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">ID: {preview.youtubeVideoId}</span>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5">
              <div className="md:col-span-5">
                <div className="aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                  <ThumbnailImage src={preview.thumbnailUrl} alt={preview.title} />
                </div>
              </div>

              <div className="md:col-span-7 space-y-3.5">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {preview.title}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{preview.channelName}</span>
                    {preview.publishedAt && (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Published {formatDate(preview.publishedAt)}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Public Statistics Retrieved from YouTube Data API */}
                <div className={`grid gap-2.5 ${showSubscriberMetric ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                      <Eye className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500 leading-none">Public Views</p>
                      <p className="text-base sm:text-lg font-extrabold text-slate-900 tabular-nums mt-1 leading-none">
                        {formatCount(preview.viewCount)}
                      </p>
                    </div>
                  </div>

                  {showSubscriberMetric && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500 leading-none">Subscribers</p>
                        <p className="text-base sm:text-lg font-extrabold text-slate-900 tabular-nums mt-1 leading-none">
                          {formatCount(preview.subscriberCount)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {preview.description && (
                  <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-3 text-xs text-slate-600 max-h-24 overflow-y-auto whitespace-pre-line leading-relaxed">
                    {preview.description}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#2563EB] shrink-0" />
                <span>Locks an immutable dated baseline snapshot before analysis.</span>
              </p>

              <button
                type="button"
                disabled={submitting}
                onClick={handleContinue}
                className="w-full sm:w-auto min-h-[50px] px-6 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold shadow-md shadow-blue-600/20 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all"
              >
                <span>{submitting ? 'Saving Baseline...' : 'Continue to Video Analysis'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 2 — HOW IT WORKS */}
      <section
        aria-label="How It Works"
        className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5"
      >
        <h2 className="text-sm font-bold text-slate-900 mb-3.5">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {steps.map((step) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.num}
                className="rounded-xl bg-slate-50/80 border border-slate-100 p-3.5 flex items-center md:items-start gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                  <StepIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#2563EB]">Step {step.num}</p>
                  <p className="text-xs sm:text-[13px] font-medium text-slate-700 leading-snug mt-0.5">
                    {step.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 3 — TRUST AND PRIVACY */}
      <section
        aria-label="Trust and Privacy"
        className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 flex items-start gap-3"
      >
        <div className="w-9 h-9 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">Safe, Read-Only Public Retrieval</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            We only retrieve publicly available video information. Your original video remains on your YouTube channel.
          </p>
        </div>
      </section>
    </div>
  );
};

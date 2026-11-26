import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Crown,
  ExternalLink,
  Link2,
  Rocket,
  ShieldCheck,
  Tv,
  X,
  Youtube,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { VideoRecord } from '../types';
import { ThumbnailImage } from './BrandMark';

interface SubmitVideoViewProps {
  onSubmitted: (video: VideoRecord) => void;
}

interface ValidationErrorState {
  title: string;
  message: string;
  existingVideo?: VideoRecord;
}

type DetectedLink =
  | { kind: 'video'; videoId: string; canonicalUrl: string }
  | { kind: 'channel'; canonicalUrl: string; label: string };

function extractClientYouTubeId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(
      trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`
    );
  } catch {
    return null;
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
    }
  }
  return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

function detectClientYouTubeLink(rawInput: string): DetectedLink | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const videoId = extractClientYouTubeId(trimmed);
  if (videoId) {
    return {
      kind: 'video',
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (/^@[a-zA-Z0-9._-]{2,60}$/.test(trimmed)) {
    return {
      kind: 'channel',
      canonicalUrl: `https://www.youtube.com/${trimmed}`,
      label: trimmed,
    };
  }

  if (/\s/.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(
      trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`
    );
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (host !== 'youtube.com') return null;

  const segments = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const first = segments[0];
  const isHandle = first.startsWith('@') && first.length >= 3;
  const isChannelPath = (first === 'channel' || first === 'c' || first === 'user') && Boolean(segments[1]);
  const isCustomSlug =
    segments.length === 1 &&
    !['watch', 'shorts', 'embed', 'live', 'playlist', 'feed', 'results'].includes(first.toLowerCase());

  if (!isHandle && !isChannelPath && !isCustomSlug) return null;

  const canonicalPath = isHandle
    ? `/${first}`
    : isChannelPath
      ? `/${first}/${segments[1]}`
      : `/${first}`;

  return {
    kind: 'channel',
    canonicalUrl: `https://www.youtube.com${canonicalPath}`,
    label: isHandle ? first : segments[1] || first,
  };
}

export const SubmitVideoView: React.FC<SubmitVideoViewProps> = ({ onSubmitted }) => {
  const [link, setLink] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pasteHint, setPasteHint] = useState('');
  const [errorState, setErrorState] = useState<ValidationErrorState | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const detected = useMemo(() => detectClientYouTubeLink(link), [link]);

  const handlePaste = async () => {
    setPasteHint('');
    setErrorState(null);
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setLink(text.trim());
          return;
        }
        setPasteHint('Clipboard is empty. Copy a YouTube channel or video link first, or paste directly.');
      } catch {
        setPasteHint('Browser blocked clipboard access — tap the field and paste manually.');
      }
    } else {
      setPasteHint('Tap the input field and paste your link.');
    }
    linkInputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasteHint('');
    setErrorState(null);

    if (!detected) {
      setErrorState({
        title: 'Valid YouTube Link Required',
        message:
          'Please paste either your YouTube channel link (e.g. youtube.com/@yourchannel or @yourchannel) or a YouTube video link.',
      });
      linkInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ video: VideoRecord }>('/api/videos', {
        link: link.trim(),
        title: customTitle.trim() || undefined,
      });
      onSubmitted(res.video);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.existingVideo) {
        onSubmitted(err.data.existingVideo as VideoRecord);
      } else {
        setErrorState({
          title: 'Could Not Save Link',
          message:
            (err as any)?.message ||
            'Unable to save your YouTube link. Please check that it is a valid channel or video link.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    {
      num: '1',
      icon: Link2,
      text: 'Drop your YouTube channel link or video link.',
    },
    {
      num: '2',
      icon: Crown,
      text: 'Pay the $1 membership fee on the promotion page.',
    },
    {
      num: '3',
      icon: Rocket,
      text: 'We promote your channel or video on our platform.',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 max-w-3xl mx-auto lg:mx-0">
      <section className="pt-0.5">
        <h1 className="text-[26px] sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Drop Your Channel or Video Link
        </h1>
        <p className="text-[15px] text-slate-600 mt-1 leading-snug max-w-2xl">
          Paste either your YouTube channel link or a video link below, then go straight to the $1 promotion page.
        </p>
      </section>

      <section
        aria-label="Submit Channel or Video Link"
        className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-6 space-y-4"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Unified Channel OR Video Link Input */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-red-600 shrink-0" />
              <label htmlFor="yt-promo-link" className="text-sm font-bold text-slate-900">
                YouTube Channel or Video Link
              </label>
            </div>
            <div className="relative">
              <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={linkInputRef}
                id="yt-promo-link"
                type="text"
                inputMode="url"
                required
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  if (errorState) setErrorState(null);
                  if (pasteHint) setPasteHint('');
                }}
                placeholder="https://www.youtube.com/@yourchannel or https://youtu.be/..."
                className="w-full min-h-[50px] pl-10 pr-24 rounded-2xl border border-slate-200 bg-slate-50/80 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {link && (
                  <button
                    type="button"
                    onClick={() => {
                      setLink('');
                      setErrorState(null);
                      linkInputRef.current?.focus();
                    }}
                    aria-label="Clear link"
                    className="min-h-[34px] min-w-[34px] rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePaste}
                  className="min-h-[34px] px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-[#2563EB] inline-flex items-center gap-1"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Paste</span>
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Channel link alone is fine — a video link is completely optional. Supports @handle, youtube.com/channel/..., or any YouTube video link.
            </p>
          </div>

          {/* Live Link Detection Preview */}
          {detected?.kind === 'channel' && (
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-3.5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                <Tv className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#2563EB] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>YouTube Channel Link Ready</span>
                </p>
                <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">{detected.label}</p>
                <a
                  href={detected.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#2563EB] mt-0.5 truncate max-w-full"
                >
                  <span className="truncate">{detected.canonicalUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>
          )}

          {detected?.kind === 'video' && (
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-3 flex items-center gap-3">
              <div className="w-24 aspect-video rounded-xl overflow-hidden bg-slate-200 shrink-0">
                <ThumbnailImage
                  src={`https://i.ytimg.com/vi/${detected.videoId}/hqdefault.jpg`}
                  alt="YouTube video preview"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#2563EB] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>YouTube Video Link Ready</span>
                </p>
                <p className="text-[11px] text-slate-600 font-mono truncate mt-0.5">
                  {detected.canonicalUrl}
                </p>
                <a
                  href={detected.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-[#2563EB] mt-1"
                >
                  <span>Preview on YouTube</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Optional Label / Title */}
          <div className="space-y-1.5">
            <label htmlFor="yt-video-title" className="block text-xs font-semibold text-slate-700">
              Title or Label (Optional)
            </label>
            <input
              id="yt-video-title"
              type="text"
              maxLength={180}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Give your channel or video a name (optional)"
              className="w-full min-h-[46px] px-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          {pasteHint && <p className="text-xs text-slate-500">{pasteHint}</p>}

          {errorState && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 text-red-800 p-4 flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs sm:text-sm font-bold">{errorState.title}</p>
                <p className="text-xs leading-relaxed opacity-90">{errorState.message}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[52px] px-6 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] disabled:opacity-60 text-white text-sm sm:text-[15px] font-semibold shadow-md shadow-blue-600/20 inline-flex items-center justify-center gap-2 transition-all"
          >
            <span>{submitting ? 'Saving Link...' : 'Drop Link & Continue to Promote ($1)'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </section>

      <section
        aria-label="How It Works"
        className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-4 sm:p-5"
      >
        <h2 className="text-sm font-bold text-slate-900 mb-3.5">How Promotion Works</h2>
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

      <section
        aria-label="Platform Promotion Policy"
        className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 flex items-start gap-3"
      >
        <div className="w-9 h-9 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">Direct Platform Promotion</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            Your content stays on your YouTube channel. Drop your channel link or a video link, pay the $1 membership fee on the next page, and we promote it directly on our platform.
          </p>
        </div>
      </section>
    </div>
  );
};

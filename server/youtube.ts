import { db } from './db.ts';

export interface YouTubeVideoDetails {
  youtubeVideoId: string;
  url: string;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  channelUrl?: string;
  thumbnailUrl: string;
  duration: string;
  publishedAt: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  subscriberCount: number | null;
  subscribersHidden: boolean;
  statsSource: 'youtube_data_api_v3' | 'youtube_oembed_partial' | 'direct_submission';
  apiNotice?: string;
}

export interface YouTubeCompetitorItem {
  competitorVideoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  viewCount: number | null;
  publishedAt: string;
  resultPosition: number;
  searchPhrase: string;
  source: 'youtube_data_api_v3';
}

export async function getYouTubeApiKey(): Promise<string> {
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'youtube_api_key'`
  );
  const dbKey = row?.value?.trim();
  return dbKey || process.env.YOUTUBE_API_KEY?.trim() || '';
}

export async function getYouTubeDefaultRegion(): Promise<string> {
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'youtube_default_region'`
  );
  return row?.value?.trim() || 'US';
}

export function extractYouTubeVideoId(rawUrl: string): {
  valid: boolean;
  videoId: string | null;
  canonicalUrl: string | null;
  error?: string;
  errorCode?: 'INVALID_URL' | 'UNSUPPORTED_LINK';
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      videoId: null,
      canonicalUrl: null,
      error: 'Please paste a YouTube video link.',
      errorCode: 'INVALID_URL',
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
      videoId: null,
      canonicalUrl: null,
      error: 'Invalid URL format. Please paste a valid YouTube link.',
      errorCode: 'INVALID_URL',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    const seg = parsed.pathname.split('/').filter(Boolean)[0];
    if (seg) videoId = seg;
  } else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] || null;
    } else if (parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] || null;
    } else if (parsed.pathname.startsWith('/live/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] || null;
    } else {
      return {
        valid: false,
        videoId: null,
        canonicalUrl: null,
        error: 'Unsupported YouTube link. Please use youtube.com/watch?v=, youtu.be/, or youtube.com/shorts/.',
        errorCode: 'UNSUPPORTED_LINK',
      };
    }
  } else {
    return {
      valid: false,
      videoId: null,
      canonicalUrl: null,
      error: 'Unsupported video link. Only youtube.com/watch?v=, youtu.be/, and youtube.com/shorts/ links are supported.',
      errorCode: 'UNSUPPORTED_LINK',
    };
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      valid: false,
      videoId: null,
      canonicalUrl: null,
      error: 'Could not extract a valid 11-character YouTube video ID from that link.',
      errorCode: 'INVALID_URL',
    };
  }

  return {
    valid: true,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function validateYouTubeChannelUrl(rawUrl: string): {
  valid: boolean;
  canonicalUrl: string | null;
  channelNameGuess: string;
  error?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      canonicalUrl: null,
      channelNameGuess: '',
      error: 'Please paste your YouTube channel link.',
    };
  }

  if (/^@[a-zA-Z0-9._-]{2,60}$/.test(trimmed)) {
    return {
      valid: true,
      canonicalUrl: `https://www.youtube.com/${trimmed}`,
      channelNameGuess: trimmed,
    };
  }

  let parsed: URL;
  try {
    if (/\s/.test(trimmed)) throw new Error('whitespace');
    parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    if (!parsed.hostname.includes('.')) throw new Error('domain');
  } catch {
    return {
      valid: false,
      canonicalUrl: null,
      channelNameGuess: '',
      error: 'Please enter a valid YouTube channel link (for example, https://www.youtube.com/@yourchannel).',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (host !== 'youtube.com') {
    return {
      valid: false,
      canonicalUrl: null,
      channelNameGuess: '',
      error: 'Channel link must be a youtube.com URL (e.g. youtube.com/@channel or youtube.com/channel/...).',
    };
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return {
      valid: false,
      canonicalUrl: null,
      channelNameGuess: '',
      error: 'Please paste the full YouTube channel link (e.g. youtube.com/@yourchannel).',
    };
  }

  const first = segments[0];
  const isHandle = first.startsWith('@') && first.length >= 3;
  const isChannelPath = (first === 'channel' || first === 'c' || first === 'user') && Boolean(segments[1]);
  const isCustomSlug = segments.length === 1 && !['watch', 'shorts', 'embed', 'live', 'playlist', 'feed', 'results'].includes(first.toLowerCase());

  if (!isHandle && !isChannelPath && !isCustomSlug) {
    return {
      valid: false,
      canonicalUrl: null,
      channelNameGuess: '',
      error: 'Please paste a YouTube channel link (such as youtube.com/@handle or youtube.com/channel/...), not a watch URL.',
    };
  }

  const canonicalPath = isHandle
    ? `/${first}`
    : isChannelPath
      ? `/${first}/${segments[1]}`
      : `/${first}`;

  const guess = isHandle ? first : segments[1] || first;

  return {
    valid: true,
    canonicalUrl: `https://www.youtube.com${canonicalPath}`,
    channelNameGuess: guess,
  };
}

function formatIsoDuration(iso: string | undefined): string {
  if (!iso) return '';
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return iso;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function toIntOrNull(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function createYouTubeError(message: string, code: string, status: number): Error & { code: string; status: number } {
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = code;
  err.status = status;
  return err;
}

export async function fetchYouTubeVideoDetails(videoId: string): Promise<YouTubeVideoDetails> {
  const apiKey = await getYouTubeApiKey();
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  if (!apiKey) {
    throw createYouTubeError(
      'YouTube Data API v3 is not configured. Add a valid YOUTUBE_API_KEY in server secrets or configure it in Admin Console → YouTube API to retrieve live video details and baseline statistics.',
      'YOUTUBE_API_KEY_MISSING',
      428
    );
  }

  const videoEndpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${encodeURIComponent(
    videoId
  )}&key=${encodeURIComponent(apiKey)}`;
  const videoRes = await fetch(videoEndpoint);
  if (!videoRes.ok) {
    const errBody = await videoRes.text();
    let apiMsg = `YouTube Data API v3 request failed (${videoRes.status}).`;
    try {
      const parsedErr = JSON.parse(errBody);
      if (parsedErr?.error?.message) {
        apiMsg = `YouTube Data API error: ${parsedErr.error.message}`;
      }
    } catch {
      // Keep status message
    }
    throw createYouTubeError(apiMsg, 'YOUTUBE_API_ERROR', 502);
  }

  const videoJson = (await videoRes.json()) as {
    items?: Array<{
      id: string;
      status?: { privacyStatus?: string };
      snippet?: {
        title?: string;
        description?: string;
        channelId?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: {
          maxres?: { url: string };
          standard?: { url: string };
          high?: { url: string };
          medium?: { url: string };
        };
      };
      contentDetails?: { duration?: string };
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  };

  const item = videoJson.items?.[0];
  if (!item) {
    throw createYouTubeError(
      'This YouTube video is unavailable, private, or could not be found.',
      'VIDEO_UNAVAILABLE',
      404
    );
  }

  const snippet = item.snippet || {};
  const stats = item.statistics || {};
  const thumbs = snippet.thumbnails || {};
  const thumbnailUrl =
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  let subscriberCount: number | null = null;
  let subscribersHidden = false;
  if (snippet.channelId) {
    const chEndpoint = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(
      snippet.channelId
    )}&key=${encodeURIComponent(apiKey)}`;
    const chRes = await fetch(chEndpoint);
    if (chRes.ok) {
      const chJson = (await chRes.json()) as {
        items?: Array<{
          statistics?: {
            subscriberCount?: string;
            hiddenSubscriberCount?: boolean;
          };
        }>;
      };
      const chStats = chJson.items?.[0]?.statistics;
      if (chStats) {
        subscribersHidden = Boolean(chStats.hiddenSubscriberCount);
        subscriberCount = subscribersHidden ? null : toIntOrNull(chStats.subscriberCount);
      }
    }
  }

  return {
    youtubeVideoId: videoId,
    url: canonicalUrl,
    title: snippet.title || 'Untitled YouTube Video',
    description: snippet.description || '',
    channelId: snippet.channelId || '',
    channelName: snippet.channelTitle || 'Unknown Channel',
    channelUrl: snippet.channelId ? `https://www.youtube.com/channel/${snippet.channelId}` : undefined,
    thumbnailUrl,
    duration: formatIsoDuration(item.contentDetails?.duration),
    publishedAt: snippet.publishedAt || '',
    viewCount: toIntOrNull(stats.viewCount),
    likeCount: toIntOrNull(stats.likeCount),
    commentCount: toIntOrNull(stats.commentCount),
    subscriberCount,
    subscribersHidden,
    statsSource: 'youtube_data_api_v3',
  };
}

export async function fetchYouTubeSubmissionDetails(params: {
  videoId: string;
  channelUrl?: string;
  channelNameGuess?: string;
  customTitle?: string;
}): Promise<YouTubeVideoDetails> {
  const apiKey = await getYouTubeApiKey();
  const canonicalUrl = `https://www.youtube.com/watch?v=${params.videoId}`;
  const fallbackThumb = `https://i.ytimg.com/vi/${params.videoId}/hqdefault.jpg`;

  if (apiKey) {
    try {
      const apiDetails = await fetchYouTubeVideoDetails(params.videoId);
      return {
        ...apiDetails,
        title: params.customTitle?.trim() || apiDetails.title,
        channelUrl: params.channelUrl || apiDetails.channelUrl,
      };
    } catch {
      // Fall through cleanly to oEmbed / direct submission
    }
  }

  // Try official YouTube oEmbed (only uses our strictly validated 11-char videoId)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
    const oRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (oRes.ok) {
      const oData = (await oRes.json()) as {
        title?: string;
        author_name?: string;
        author_url?: string;
        thumbnail_url?: string;
      };
      const oembedThumb =
        oData.thumbnail_url && oData.thumbnail_url.startsWith('https://') ? oData.thumbnail_url : fallbackThumb;
      return {
        youtubeVideoId: params.videoId,
        url: canonicalUrl,
        title: params.customTitle?.trim() || oData.title?.trim() || `YouTube Video (${params.videoId})`,
        description: '',
        channelId: '',
        channelName: oData.author_name?.trim() || params.channelNameGuess || 'YouTube Channel',
        channelUrl: params.channelUrl || (oData.author_url?.startsWith('https://') ? oData.author_url : undefined),
        thumbnailUrl: oembedThumb,
        duration: '',
        publishedAt: '',
        viewCount: null,
        likeCount: null,
        commentCount: null,
        subscriberCount: null,
        subscribersHidden: false,
        statsSource: 'youtube_oembed_partial',
      };
    }
  } catch {
    // Fall through cleanly to direct submission
  }

  return {
    youtubeVideoId: params.videoId,
    url: canonicalUrl,
    title: params.customTitle?.trim() || `YouTube Video (${params.videoId})`,
    description: '',
    channelId: '',
    channelName: params.channelNameGuess || 'YouTube Channel',
    channelUrl: params.channelUrl,
    thumbnailUrl: fallbackThumb,
    duration: '',
    publishedAt: '',
    viewCount: null,
    likeCount: null,
    commentCount: null,
    subscriberCount: null,
    subscribersHidden: false,
    statsSource: 'direct_submission',
  };
}

export async function searchYouTubeCompetitors(
  searchPhrase: string,
  maxResults = 8
): Promise<{ items: YouTubeCompetitorItem[]; regionCode: string }> {
  const apiKey = await getYouTubeApiKey();
  if (!apiKey) {
    const err = new Error(
      'YouTube Data API v3 key is required for live competitor search. An administrator can configure it in Admin Console -> YouTube API Config or via YOUTUBE_API_KEY.'
    ) as Error & { code?: string };
    err.code = 'YOUTUBE_API_KEY_MISSING';
    throw err;
  }

  const regionCode = await getYouTubeDefaultRegion();
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
    searchPhrase
  )}&maxResults=${Math.min(Math.max(maxResults, 1), 15)}&regionCode=${encodeURIComponent(
    regionCode
  )}&key=${encodeURIComponent(apiKey)}`;

  const sRes = await fetch(searchUrl);
  if (!sRes.ok) {
    const body = await sRes.text();
    throw new Error(`YouTube Search API failed (${sRes.status}): ${body.slice(0, 220)}`);
  }

  const sJson = (await sRes.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: { high?: { url: string }; medium?: { url: string } };
      };
    }>;
  };

  const searchItems = (sJson.items || []).filter((i) => i.id?.videoId);
  if (searchItems.length === 0) {
    return { items: [], regionCode };
  }

  const ids = searchItems.map((i) => i.id!.videoId!).join(',');
  const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(
    ids
  )}&key=${encodeURIComponent(apiKey)}`;
  const statsMap = new Map<string, number | null>();

  const stRes = await fetch(statsUrl);
  if (stRes.ok) {
    const stJson = (await stRes.json()) as {
      items?: Array<{ id: string; statistics?: { viewCount?: string } }>;
    };
    for (const v of stJson.items || []) {
      statsMap.set(v.id, toIntOrNull(v.statistics?.viewCount));
    }
  }

  const items: YouTubeCompetitorItem[] = searchItems.map((item, idx) => {
    const vid = item.id!.videoId!;
    const sn = item.snippet || {};
    return {
      competitorVideoId: vid,
      title: sn.title || 'Untitled Video',
      channelName: sn.channelTitle || 'Unknown Channel',
      thumbnailUrl:
        sn.thumbnails?.high?.url ||
        sn.thumbnails?.medium?.url ||
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      viewCount: statsMap.get(vid) ?? null,
      publishedAt: sn.publishedAt || '',
      resultPosition: idx + 1,
      searchPhrase,
      source: 'youtube_data_api_v3',
    };
  });

  return { items, regionCode };
}

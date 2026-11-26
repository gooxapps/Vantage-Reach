import type { Request } from 'express';
import net from 'net';
import { loadUserById, parseCookies, verifySessionToken, type AuthedUser } from './auth.ts';
import { db } from './db.ts';

export type VisitorEventType =
  | 'session_start'
  | 'page_view'
  | 'screen_view'
  | 'heartbeat'
  | 'auth_login'
  | 'auth_register'
  | 'action';

const ALLOWED_EVENT_TYPES = new Set<VisitorEventType>([
  'session_start',
  'page_view',
  'screen_view',
  'heartbeat',
  'auth_login',
  'auth_register',
  'action',
]);

interface GeoLocationResult {
  country: string;
  region: string;
  city: string;
  isp: string;
}

const geoCache = new Map<string, GeoLocationResult & { expiresAt: number }>();
const GEO_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function cleanText(val: unknown, maxLen = 160): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function extractClientIp(req: Request): string {
  const candidates = [
    req.headers['cf-connecting-ip'],
    req.headers['x-forwarded-for'],
    req.headers['x-real-ip'],
    req.ip,
    req.socket?.remoteAddress,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const str = Array.isArray(raw) ? raw[0] : String(raw);
    const first = str.split(',')[0].trim().replace(/^::ffff:/i, '');
    if (net.isIP(first)) return first;
  }
  return '';
}

export function isPublicIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (!family) return false;
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
    return true;
  }
  const normalized = ip.toLowerCase();
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return false;
  }
  return true;
}

export function parseUserAgent(uaRaw: string) {
  const ua = uaRaw || '';
  const lower = ua.toLowerCase();

  let deviceType: 'Bot' | 'Mobile' | 'Tablet' | 'Desktop' = 'Desktop';
  if (/bot|crawler|spider|slurp|curl|wget|python-requests|headless|lighthouse/i.test(ua)) {
    deviceType = 'Bot';
  } else if (/ipad|tablet|playbook|silk|android(?!.*mobile)/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) {
    deviceType = 'Mobile';
  }

  let osName = 'Unknown';
  if (deviceType === 'Bot') {
    osName = 'Automated Client';
  } else if (/iphone|ipod/i.test(ua)) {
    osName = 'iOS';
  } else if (/ipad/i.test(ua)) {
    osName = 'iPadOS';
  } else if (/android/i.test(ua)) {
    const m = ua.match(/Android\s+([0-9.]+)/i);
    osName = m ? `Android ${m[1]}` : 'Android';
  } else if (/windows nt 10\.0/i.test(ua)) {
    osName = 'Windows 10/11';
  } else if (/windows/i.test(ua)) {
    osName = 'Windows';
  } else if (/cros/i.test(ua)) {
    osName = 'ChromeOS';
  } else if (/mac os x|macintosh/i.test(ua)) {
    osName = 'macOS';
  } else if (/linux/i.test(ua)) {
    osName = 'Linux';
  }

  let browserName = 'Unknown';
  if (deviceType === 'Bot') {
    browserName = 'Bot';
  } else if (/edg(?:a|ios)?\//i.test(ua)) {
    browserName = 'Microsoft Edge';
  } else if (/samsungbrowser\//i.test(ua)) {
    browserName = 'Samsung Internet';
  } else if (/opr\/|opera/i.test(ua)) {
    browserName = 'Opera';
  } else if (/firefox|fxios/i.test(ua)) {
    browserName = 'Firefox';
  } else if (/crios|chrome/i.test(ua) && !/edg/i.test(ua)) {
    browserName = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
    browserName = 'Safari';
  } else if (lower.includes('mozilla')) {
    browserName = 'Web Browser';
  }

  let deviceVendor = 'Desktop PC';
  if (deviceType === 'Bot') {
    deviceVendor = 'Automated Bot';
  } else if (/iphone/i.test(ua)) {
    deviceVendor = 'Apple iPhone';
  } else if (/ipad/i.test(ua)) {
    deviceVendor = 'Apple iPad';
  } else if (/macintosh|mac os x/i.test(ua)) {
    deviceVendor = 'Apple Mac';
  } else if (/sm-[a-z0-9]+|samsung/i.test(ua)) {
    deviceVendor = 'Samsung Device';
  } else if (/pixel/i.test(ua)) {
    deviceVendor = 'Google Pixel';
  } else if (/huawei/i.test(ua)) {
    deviceVendor = 'Huawei';
  } else if (/xiaomi|redmi|poco/i.test(ua)) {
    deviceVendor = 'Xiaomi';
  } else if (/oneplus/i.test(ua)) {
    deviceVendor = 'OnePlus';
  } else if (/android/i.test(ua)) {
    deviceVendor = deviceType === 'Tablet' ? 'Android Tablet' : 'Android Phone';
  } else if (/windows/i.test(ua)) {
    deviceVendor = 'Windows PC';
  } else if (/linux/i.test(ua)) {
    deviceVendor = 'Linux Desktop';
  }

  return { deviceType, osName, browserName, deviceVendor };
}

function getHeaderString(req: Request, name: string): string {
  const val = req.headers[name];
  if (!val) return '';
  return cleanText(Array.isArray(val) ? val[0] : val, 100);
}

export async function resolveGeoLocation(req: Request, ip: string): Promise<GeoLocationResult> {
  const headerCountry =
    getHeaderString(req, 'x-vercel-ip-country') ||
    getHeaderString(req, 'cf-ipcountry') ||
    getHeaderString(req, 'x-appengine-country') ||
    getHeaderString(req, 'x-country-code');
  const headerRegion =
    getHeaderString(req, 'x-vercel-ip-country-region') ||
    getHeaderString(req, 'x-appengine-region');
  const headerCity =
    getHeaderString(req, 'x-vercel-ip-city') ||
    getHeaderString(req, 'x-appengine-city');

  if (headerCountry && headerCountry !== 'XX' && headerCountry !== 'ZZ' && headerCity) {
    return {
      country: headerCountry,
      region: headerRegion,
      city: decodeURIComponentSafe(headerCity),
      isp: '',
    };
  }

  if (!ip || !isPublicIp(ip)) {
    return {
      country: headerCountry && headerCountry !== 'XX' ? headerCountry : 'Local / Private Network',
      region: headerRegion,
      city: headerCity ? decodeURIComponentSafe(headerCity) : 'Internal',
      isp: '',
    };
  }

  const cached = geoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      country: cached.country,
      region: cached.region,
      city: cached.city,
      isp: cached.isp,
    };
  }

  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        success?: boolean;
        country?: string;
        region?: string;
        city?: string;
        connection?: { isp?: string; org?: string };
      };
      if (json && json.success !== false && json.country) {
        const result: GeoLocationResult = {
          country: cleanText(json.country, 80) || headerCountry || 'Unknown',
          region: cleanText(json.region, 80) || headerRegion,
          city: cleanText(json.city, 80) || headerCity,
          isp: cleanText(json.connection?.isp || json.connection?.org, 100),
        };
        geoCache.set(ip, { ...result, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
        return result;
      }
    }
  } catch {
    // GeoIP fallback gracefully ignores transient lookup failures
  }

  return {
    country: headerCountry && headerCountry !== 'XX' ? headerCountry : 'Unknown',
    region: headerRegion,
    city: headerCity ? decodeURIComponentSafe(headerCity) : '',
    isp: '',
  };
}

function decodeURIComponentSafe(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

export function tryResolveOptionalUser(req: Request): AuthedUser | null {
  try {
    const cookies = parseCookies(req);
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const token = cookies['vr_session'] || bearer;
    if (!token) return null;
    const payload = verifySessionToken(token);
    if (!payload) return null;
    return loadUserById(payload.uid);
  } catch {
    return null;
  }
}

export interface TrackPayload {
  visitorId: string;
  sessionId: string;
  eventType: VisitorEventType;
  pagePath: string;
  pageTitle: string;
  screenResolution: string;
  viewportSize: string;
  timezone: string;
  language: string;
  platform: string;
  networkType: string;
  isPwa: boolean;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  details: Record<string, unknown>;
}

export function sanitizeTrackPayload(body: any, req: Request): TrackPayload | null {
  const sessionId = cleanText(body?.sessionId, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  const visitorId = cleanText(body?.visitorId, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sessionId || !visitorId) return null;

  const rawEvent = cleanText(body?.eventType, 32) as VisitorEventType;
  const eventType: VisitorEventType = ALLOWED_EVENT_TYPES.has(rawEvent) ? rawEvent : 'page_view';

  const rawPath = cleanText(body?.pagePath, 200) || '/';
  const pagePath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  const acceptLang = cleanText(
    Array.isArray(req.headers['accept-language'])
      ? req.headers['accept-language'][0]
      : req.headers['accept-language'],
    40
  ).split(',')[0];

  const detailsObj =
    body?.details && typeof body.details === 'object' && !Array.isArray(body.details)
      ? body.details
      : {};

  return {
    visitorId,
    sessionId,
    eventType,
    pagePath,
    pageTitle: cleanText(body?.pageTitle, 120),
    screenResolution: cleanText(body?.screenResolution, 32),
    viewportSize: cleanText(body?.viewportSize, 32),
    timezone: cleanText(body?.timezone, 64),
    language: cleanText(body?.language, 32) || acceptLang,
    platform: cleanText(body?.platform, 48),
    networkType: cleanText(body?.networkType, 24),
    isPwa: Boolean(body?.isPwa),
    referrer: cleanText(body?.referrer, 300),
    utmSource: cleanText(body?.utmSource, 80),
    utmMedium: cleanText(body?.utmMedium, 80),
    utmCampaign: cleanText(body?.utmCampaign, 80),
    details: detailsObj,
  };
}

export async function recordVisitorTelemetry(req: Request, payload: TrackPayload) {
  const ip = extractClientIp(req);
  const ua = cleanText(req.headers['user-agent'], 400);
  const parsedUa = parseUserAgent(ua);
  const user = tryResolveOptionalUser(req);

  const existing = db
    .prepare(`SELECT id, user_id, country, city FROM visitor_sessions WHERE session_id = ?`)
    .get(payload.sessionId) as
    | { id: number; user_id: number | null; country: string; city: string }
    | undefined;

  if (!existing) {
    const geo = await resolveGeoLocation(req, ip);
    db.prepare(
      `INSERT INTO visitor_sessions (
         visitor_id, session_id, user_id, user_email, ip_address,
         country, region, city, isp, timezone, language,
         device_type, os_name, browser_name, device_vendor, user_agent,
         screen_resolution, viewport_size, platform, network_type, is_pwa,
         referrer, utm_source, utm_medium, utm_campaign,
         entry_path, current_path, page_views
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      payload.visitorId,
      payload.sessionId,
      user?.id ?? null,
      user?.email ?? '',
      ip,
      geo.country,
      geo.region,
      geo.city,
      geo.isp,
      payload.timezone,
      payload.language,
      parsedUa.deviceType,
      parsedUa.osName,
      parsedUa.browserName,
      parsedUa.deviceVendor,
      ua,
      payload.screenResolution,
      payload.viewportSize,
      payload.platform,
      payload.networkType,
      payload.isPwa ? 1 : 0,
      payload.referrer || 'Direct',
      payload.utmSource,
      payload.utmMedium,
      payload.utmCampaign,
      payload.pagePath,
      payload.pagePath
    );
  } else {
    const isPageHit = payload.eventType === 'page_view' || payload.eventType === 'screen_view';
    db.prepare(
      `UPDATE visitor_sessions
       SET last_seen_at = datetime('now'),
           current_path = CASE WHEN ? != '' THEN ? ELSE current_path END,
           viewport_size = CASE WHEN ? != '' THEN ? ELSE viewport_size END,
           network_type = CASE WHEN ? != '' THEN ? ELSE network_type END,
           is_pwa = CASE WHEN ? = 1 THEN 1 ELSE is_pwa END,
           user_id = COALESCE(?, user_id),
           user_email = CASE WHEN ? != '' THEN ? ELSE user_email END,
           page_views = page_views + ?
       WHERE session_id = ?`
    ).run(
      payload.eventType === 'heartbeat' ? '' : payload.pagePath,
      payload.pagePath,
      payload.viewportSize,
      payload.viewportSize,
      payload.networkType,
      payload.networkType,
      payload.isPwa ? 1 : 0,
      user?.id ?? null,
      user?.email ?? '',
      user?.email ?? '',
      isPageHit ? 1 : 0,
      payload.sessionId
    );
  }

  // Keep event log crisp: skip routine heartbeats after session exists
  if (payload.eventType !== 'heartbeat' || !existing) {
    db.prepare(
      `INSERT INTO visitor_events (session_id, visitor_id, user_id, event_type, page_path, page_title, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      payload.sessionId,
      payload.visitorId,
      user?.id ?? null,
      payload.eventType,
      payload.pagePath,
      payload.pageTitle,
      JSON.stringify(payload.details).slice(0, 1000)
    );
  }
}

export function getAdminVisitorAnalytics(params: {
  window?: string;
  device?: string;
  authFilter?: string;
  search?: string;
}) {
  const windowKey = params.window || '24h';
  const deviceFilter = params.device || 'all';
  const authFilter = params.authFilter || 'all';
  const search = cleanText(params.search, 100).toLowerCase();

  const whereClauses: string[] = [];
  const queryArgs: Array<string | number> = [];

  if (windowKey === 'live') {
    whereClauses.push(`last_seen_at >= datetime('now', '-3 minutes')`);
  } else if (windowKey === '24h') {
    whereClauses.push(`last_seen_at >= datetime('now', '-24 hours')`);
  } else if (windowKey === '7d') {
    whereClauses.push(`last_seen_at >= datetime('now', '-7 days')`);
  } else if (windowKey === '30d') {
    whereClauses.push(`last_seen_at >= datetime('now', '-30 days')`);
  }

  if (deviceFilter !== 'all') {
    whereClauses.push(`device_type = ?`);
    queryArgs.push(deviceFilter);
  }

  if (authFilter === 'authenticated') {
    whereClauses.push(`user_id IS NOT NULL`);
  } else if (authFilter === 'anonymous') {
    whereClauses.push(`user_id IS NULL`);
  }

  if (search) {
    const like = `%${search}%`;
    whereClauses.push(
      `(LOWER(ip_address) LIKE ? OR LOWER(user_email) LIKE ? OR LOWER(country) LIKE ? OR LOWER(city) LIKE ? OR LOWER(browser_name) LIKE ? OR LOWER(current_path) LIKE ? OR LOWER(referrer) LIKE ? OR LOWER(device_vendor) LIKE ?)`
    );
    for (let i = 0; i < 8; i++) queryArgs.push(like);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const summary = {
    activeNow: (
      db
        .prepare(
          `SELECT COUNT(DISTINCT visitor_id) AS c FROM visitor_sessions WHERE last_seen_at >= datetime('now', '-3 minutes')`
        )
        .get() as { c: number }
    ).c,
    todayVisitors: (
      db
        .prepare(
          `SELECT COUNT(DISTINCT visitor_id) AS c FROM visitor_sessions WHERE last_seen_at >= datetime('now', '-24 hours')`
        )
        .get() as { c: number }
    ).c,
    todaySessions: (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM visitor_sessions WHERE last_seen_at >= datetime('now', '-24 hours')`
        )
        .get() as { c: number }
    ).c,
    totalVisitors: (
      db.prepare(`SELECT COUNT(DISTINCT visitor_id) AS c FROM visitor_sessions`).get() as { c: number }
    ).c,
    totalSessions: (
      db.prepare(`SELECT COUNT(*) AS c FROM visitor_sessions`).get() as { c: number }
    ).c,
    totalPageViews: (
      db.prepare(`SELECT COALESCE(SUM(page_views), 0) AS s FROM visitor_sessions`).get() as { s: number }
    ).s,
    pwaVisitors: (
      db.prepare(`SELECT COUNT(DISTINCT visitor_id) AS c FROM visitor_sessions WHERE is_pwa = 1`).get() as {
        c: number;
      }
    ).c,
    authenticatedVisitors: (
      db
        .prepare(`SELECT COUNT(DISTINCT visitor_id) AS c FROM visitor_sessions WHERE user_id IS NOT NULL`)
        .get() as { c: number }
    ).c,
  };

  const visitors = db
    .prepare(
      `SELECT *,
              CASE WHEN last_seen_at >= datetime('now', '-3 minutes') THEN 1 ELSE 0 END AS is_online
       FROM visitor_sessions
       ${whereSql}
       ORDER BY last_seen_at DESC, id DESC
       LIMIT 150`
    )
    .all(...queryArgs) as Array<Record<string, any>>;

  const devices = db
    .prepare(
      `SELECT device_type AS label, COUNT(*) AS count
       FROM visitor_sessions ${whereSql}
       GROUP BY device_type
       ORDER BY count DESC`
    )
    .all(...queryArgs);

  const locations = db
    .prepare(
      `SELECT country, COUNT(*) AS count
       FROM visitor_sessions ${whereSql}
       GROUP BY country
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(...queryArgs);

  const browsers = db
    .prepare(
      `SELECT browser_name AS label, COUNT(*) AS count
       FROM visitor_sessions ${whereSql}
       GROUP BY browser_name
       ORDER BY count DESC
       LIMIT 8`
    )
    .all(...queryArgs);

  const operatingSystems = db
    .prepare(
      `SELECT os_name AS label, COUNT(*) AS count
       FROM visitor_sessions ${whereSql}
       GROUP BY os_name
       ORDER BY count DESC
       LIMIT 8`
    )
    .all(...queryArgs);

  const topPages = db
    .prepare(
      `SELECT current_path AS path, SUM(page_views) AS views, COUNT(*) AS sessions
       FROM visitor_sessions ${whereSql}
       GROUP BY current_path
       ORDER BY views DESC
       LIMIT 8`
    )
    .all(...queryArgs);

  const topReferrers = db
    .prepare(
      `SELECT referrer, COUNT(*) AS count
       FROM visitor_sessions ${whereSql}
       GROUP BY referrer
       ORDER BY count DESC
       LIMIT 8`
    )
    .all(...queryArgs);

  const hourlyTraffic = db
    .prepare(
      `SELECT strftime('%H:00', last_seen_at) AS hour,
              COUNT(*) AS sessions,
              COALESCE(SUM(page_views), 0) AS pageViews
       FROM visitor_sessions
       WHERE last_seen_at >= datetime('now', '-24 hours')
       GROUP BY strftime('%Y-%m-%d %H', last_seen_at)
       ORDER BY MIN(last_seen_at) ASC`
    )
    .all();

  return {
    summary,
    visitors,
    breakdowns: {
      devices,
      locations,
      browsers,
      operatingSystems,
      topPages,
      topReferrers,
      hourlyTraffic,
    },
  };
}

export function getAdminVisitorSessionDetail(sessionId: string) {
  const cleanId = cleanText(sessionId, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) return null;

  const session = db
    .prepare(
      `SELECT *,
              CASE WHEN last_seen_at >= datetime('now', '-3 minutes') THEN 1 ELSE 0 END AS is_online
       FROM visitor_sessions
       WHERE session_id = ?`
    )
    .get(cleanId) as Record<string, any> | undefined;

  if (!session) return null;

  const events = db
    .prepare(
      `SELECT * FROM visitor_events
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 120`
    )
    .all(cleanId);

  const priorSessionsCount = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM visitor_sessions WHERE visitor_id = ?`)
      .get(session.visitor_id) as { c: number }
  ).c;

  return {
    session,
    events,
    priorSessionsCount,
  };
}

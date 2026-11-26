import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  clearSessionCookie,
  rateLimit,
  requireAdmin,
  requireAuth,
  setSessionCookie,
  signSessionToken,
  writeAuditLog,
  type AuthRequest,
} from './server/auth.ts';
import {
  db,
  hashPasswordSync,
  initDatabase,
  isPostgresDatabase,
  sqlAgo,
  sqlNow,
  verifyPasswordSync,
} from './server/db.ts';
import { generateYouTubeSeoAnalysis } from './server/gemini.ts';
import {
  getActiveDefaultProvider,
  getFlutterwaveCredentials,
  getPaymentGatewayStatus,
  initializePayment,
  verifyPaymentOnServer,
  verifyWebhookSignature,
  type PaymentProviderName,
} from './server/payments.ts';
import {
  buildChannelSubmissionDetails,
  extractYouTubeVideoId,
  fetchYouTubeSubmissionDetails,
  fetchYouTubeVideoDetails,
  parseFlexibleYouTubeLink,
  searchYouTubeCompetitors,
  validateYouTubeChannelUrl,
} from './server/youtube.ts';
import {
  getAdminVisitorAnalytics,
  getAdminVisitorSessionDetail,
  recordVisitorTelemetry,
  sanitizeTrackPayload,
} from './server/visitors.ts';

function toNullableNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function getAppBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto === 'https' || forwardedProto === 'http' ? forwardedProto : req.protocol || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function normalizeVideoRow(row: Record<string, any> | undefined | null) {
  if (!row) return row;
  return {
    ...row,
    id: Number(row.id),
    user_id: Number(row.user_id),
    latest_views: toNullableNum(row.latest_views),
    latest_likes: toNullableNum(row.latest_likes),
    latest_comments: toNullableNum(row.latest_comments),
    latest_subscribers: toNullableNum(row.latest_subscribers),
    subscribers_hidden: Number(row.subscribers_hidden || 0),
    baseline_views: row.baseline_views !== undefined ? toNullableNum(row.baseline_views) : undefined,
    baseline_likes: row.baseline_likes !== undefined ? toNullableNum(row.baseline_likes) : undefined,
    baseline_comments: row.baseline_comments !== undefined ? toNullableNum(row.baseline_comments) : undefined,
    baseline_subscribers:
      row.baseline_subscribers !== undefined ? toNullableNum(row.baseline_subscribers) : undefined,
    snapshot_count: row.snapshot_count !== undefined ? Number(row.snapshot_count || 0) : undefined,
    seo_count: row.seo_count !== undefined ? Number(row.seo_count || 0) : undefined,
  };
}

function normalizeSnapshotRow(row: Record<string, any> | undefined | null) {
  if (!row) return row;
  return {
    ...row,
    id: Number(row.id),
    video_id: Number(row.video_id),
    user_id: Number(row.user_id),
    campaign_id: row.campaign_id !== null && row.campaign_id !== undefined ? Number(row.campaign_id) : null,
    is_baseline: Number(row.is_baseline || 0),
    view_count: toNullableNum(row.view_count),
    like_count: toNullableNum(row.like_count),
    comment_count: toNullableNum(row.comment_count),
    subscriber_count: toNullableNum(row.subscriber_count),
    subscribers_hidden: Number(row.subscribers_hidden || 0),
  };
}

const asyncHandler =
  (fn: (req: AuthRequest, res: express.Response, next: express.NextFunction) => Promise<any> | any) =>
  (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

function resolvePort(): number {
  const argIdx = process.argv.indexOf('--port');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    const parsed = Number(process.argv[argIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (process.env.NODE_ENV !== 'production' && (!process.env.PORT || process.env.PORT === '8080')) {
    return 3000;
  }
  return Number(process.env.PORT || 3000);
}

export const app = express();
app.set('trust proxy', 1);
const PORT = resolvePort();
const SERVER_BOOT_ID = crypto.randomBytes(6).toString('hex');

// Capture raw body for webhook signature verification while parsing JSON
app.use(
  express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// Ensure database schema + baseline seed data exist before any API request (idempotent for serverless cold starts)
app.use(
  '/api',
  asyncHandler(async (_req, _res, next) => {
    await initDatabase();
    next();
  })
);

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    ok: true,
    service: 'Vantage Reach API',
    database: isPostgresDatabase() ? 'neon-postgres' : 'sqlite',
    bootId: SERVER_BOOT_ID,
    timestamp: new Date().toISOString(),
  });
});

// ==================== PUBLIC SITE BRANDING, ICON & MANIFEST ====================

export interface PublicSiteConfig {
  appName: string;
  shortName: string;
  companyName: string;
  tagline: string;
  heroHeadline: string;
  heroDescription: string;
  metaDescription: string;
  footerText: string;
  supportEmail: string;
  logoUrl: string;
  iconUrl: string;
  themeColor: string;
  splashEnabled: boolean;
  splashTitle: string;
  splashSubtitle: string;
  splashBgColor: string;
  splashTextColor: string;
  splashAccentColor: string;
  splashDurationMs: number;
  splashImageUrl: string;
  welcomeNotifTitle: string;
  welcomeNotifMessage: string;
  announcementBanner: string;
  registrationsOpen: boolean;
  updatedAt: string;
}

const DEFAULT_SITE_CONFIG: PublicSiteConfig = {
  appName: 'Vantage Reach',
  shortName: 'VantageReach',
  companyName: 'Vantage Talent Search Global',
  tagline: 'Grow · Rank · Earn Globally',
  heroHeadline: 'Your YouTube Growth Partner — Smarter, Measurable, Global.',
  heroDescription:
    'Submit your YouTube videos, preserve immutable baseline performance snapshots, benchmark real search competitors, and generate structured Gemini SEO recommendations alongside legitimate promotion campaigns.',
  metaDescription:
    'International YouTube creator discovery, legitimate promotion campaign management, competitor research, and Gemini-powered SEO intelligence by Vantage Talent Search Global.',
  footerText: 'Vantage Reach · Operated by Vantage Talent Search Global',
  supportEmail: 'support@vantagereach.global',
  logoUrl: '',
  iconUrl: '',
  themeColor: '#2563EB',
  splashEnabled: true,
  splashTitle: 'Vantage Reach',
  splashSubtitle: 'YouTube Creator Growth & SEO Intelligence',
  splashBgColor: '#FFFFFF',
  splashTextColor: '#0F172A',
  splashAccentColor: '#2563EB',
  splashDurationMs: 900,
  splashImageUrl: '',
  welcomeNotifTitle: 'Welcome to Vantage Reach',
  welcomeNotifMessage:
    'Welcome to Vantage Reach, {name}! We are excited to help grow your channel globally. Submit your first YouTube video to lock in a live baseline snapshot, compare search competitors, and unlock Gemini SEO insights.',
  announcementBanner: '',
  registrationsOpen: true,
  updatedAt: '',
};

function sanitizeHexColor(val: unknown, fallback: string): string {
  const s = String(val ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  }
  return fallback;
}

function sanitizeSiteMediaUrl(val: unknown, fieldName: string): string {
  const raw = String(val ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) {
    if (raw.startsWith('//') || raw.includes('..') || raw.length > 300) {
      throw new Error(`${fieldName} contains an invalid relative path.`);
    }
    return raw;
  }
  if (raw.startsWith('https://')) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`${fieldName} must be a valid HTTPS URL.`);
    }
    if (parsed.protocol !== 'https:' || raw.length > 500) {
      throw new Error(`${fieldName} must use HTTPS and be under 500 characters.`);
    }
    return parsed.toString();
  }
  if (raw.startsWith('data:image/')) {
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
      throw new Error(`${fieldName} image upload must be a PNG, JPEG, or WebP image.`);
    }
    if (raw.length > 1_500_000) {
      throw new Error(`${fieldName} uploaded image is too large (max ~1 MB).`);
    }
    return raw;
  }
  throw new Error(`${fieldName} must be an uploaded PNG/JPG/WebP image, a root path (/...), or an HTTPS URL.`);
}

async function getPublicSiteConfig(): Promise<PublicSiteConfig> {
  const rows = await db.queryAll<{ key: string; value: string; updated_at: string }>(
    `SELECT key, value, updated_at FROM system_settings
     WHERE key LIKE 'site_%' OR key IN ('company_name', 'support_email')`
  );
  const map = new Map<string, string>();
  let latestUpdated = '';
  for (const r of rows) {
    map.set(r.key, r.value ?? '');
    if (r.updated_at && r.updated_at > latestUpdated) latestUpdated = r.updated_at;
  }
  const str = (k: string, fb: string) => {
    const v = map.get(k);
    return v !== undefined && v.trim() !== '' ? v.trim() : fb;
  };
  const optStr = (k: string, fb: string) => {
    const v = map.get(k);
    return v !== undefined ? v.trim() : fb;
  };
  const durationRaw = Number(map.get('site_splash_duration_ms') ?? DEFAULT_SITE_CONFIG.splashDurationMs);
  const splashDurationMs = Number.isFinite(durationRaw) ? Math.min(4000, Math.max(0, Math.round(durationRaw))) : 900;

  return {
    appName: str('site_app_name', DEFAULT_SITE_CONFIG.appName),
    shortName: str('site_short_name', DEFAULT_SITE_CONFIG.shortName),
    companyName: str('company_name', DEFAULT_SITE_CONFIG.companyName),
    tagline: str('site_tagline', DEFAULT_SITE_CONFIG.tagline),
    heroHeadline: str('site_hero_headline', DEFAULT_SITE_CONFIG.heroHeadline),
    heroDescription: str('site_hero_description', DEFAULT_SITE_CONFIG.heroDescription),
    metaDescription: str('site_meta_description', DEFAULT_SITE_CONFIG.metaDescription),
    footerText: str('site_footer_text', DEFAULT_SITE_CONFIG.footerText),
    supportEmail: str('support_email', DEFAULT_SITE_CONFIG.supportEmail),
    logoUrl: optStr('site_logo_url', ''),
    iconUrl: optStr('site_icon_url', ''),
    themeColor: sanitizeHexColor(map.get('site_theme_color'), DEFAULT_SITE_CONFIG.themeColor),
    splashEnabled: (map.get('site_splash_enabled') ?? '1') !== '0',
    splashTitle: str('site_splash_title', str('site_app_name', DEFAULT_SITE_CONFIG.splashTitle)),
    splashSubtitle: str('site_splash_subtitle', DEFAULT_SITE_CONFIG.splashSubtitle),
    splashBgColor: sanitizeHexColor(map.get('site_splash_bg_color'), DEFAULT_SITE_CONFIG.splashBgColor),
    splashTextColor: sanitizeHexColor(map.get('site_splash_text_color'), DEFAULT_SITE_CONFIG.splashTextColor),
    splashAccentColor: sanitizeHexColor(map.get('site_splash_accent_color'), DEFAULT_SITE_CONFIG.splashAccentColor),
    splashDurationMs,
    splashImageUrl: optStr('site_splash_image_url', ''),
    welcomeNotifTitle: str('site_welcome_notif_title', DEFAULT_SITE_CONFIG.welcomeNotifTitle),
    welcomeNotifMessage: str('site_welcome_notif_message', DEFAULT_SITE_CONFIG.welcomeNotifMessage),
    announcementBanner: optStr('site_announcement_banner', ''),
    registrationsOpen: (map.get('site_registrations_open') ?? '1') !== '0',
    updatedAt: latestUpdated,
  };
}

function formatWelcomeMessage(template: string, name: string): string {
  const safeName = (name || '').trim() || 'Creator';
  if (template.includes('{name}')) {
    return template.replace(/\{name\}/g, safeName);
  }
  return template;
}

app.get(
  '/api/site-config',
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const config = await getPublicSiteConfig();
    res.json({ config });
  })
);

app.get(
  '/api/site-icon.png',
  asyncHandler(async (req, res) => {
    const config = await getPublicSiteConfig();
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    const icon = config.iconUrl;
    const match = icon.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (match) {
      const mime = match[1] === 'jpg' ? 'jpeg' : match[1];
      res.setHeader('Content-Type', `image/${mime}`);
      return res.send(Buffer.from(match[2], 'base64'));
    }
    if (icon.startsWith('https://')) {
      return res.redirect(302, icon);
    }
    const size = String(req.query.size || '') === '512' ? 'pwa-512x512.png' : 'pwa-192x192.png';
    const localRel = icon.startsWith('/') ? icon.slice(1) : size;
    const publicDir = path.resolve(process.cwd(), 'public');
    const candidate = path.resolve(publicDir, localRel);
    const fallback = path.resolve(publicDir, size);
    const target = candidate.startsWith(publicDir + path.sep) && fs.existsSync(candidate) ? candidate : fallback;
    if (fs.existsSync(target)) {
      return res.sendFile(target);
    }
    res.status(404).end();
  })
);

async function sendDynamicManifest(res: express.Response) {
  const config = await getPublicSiteConfig();
  const v = encodeURIComponent(config.updatedAt || '1');
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    id: '/',
    name: config.appName,
    short_name: config.shortName.slice(0, 16),
    description: config.metaDescription,
    theme_color: config.themeColor,
    background_color: config.splashBgColor,
    display: 'standalone',
    orientation: 'any',
    prefer_related_applications: false,
    categories: ['business', 'productivity'],
    start_url: '/',
    scope: '/',
    icons: [
      {
        src: `/api/site-icon.png?size=192&v=${v}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/api/site-icon.png?size=512&v=${v}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: config.iconUrl ? `/api/site-icon.png?size=512&v=${v}` : '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  });
}

app.get(
  '/api/manifest.webmanifest',
  asyncHandler(async (_req, res) => {
    await sendDynamicManifest(res);
  })
);

// ==================== SITE VISITOR TELEMETRY ====================

app.post(
  '/api/analytics/track',
  rateLimit('analytics-track', 120, 60_000),
  asyncHandler(async (req, res) => {
    const payload = sanitizeTrackPayload(req.body, req);
    if (!payload) {
      return res.status(400).json({ error: 'Valid visitorId and sessionId are required.' });
    }
    try {
      await recordVisitorTelemetry(req, payload);
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Visitor tracking error:', err?.message || err);
      res.status(500).json({ error: 'Unable to record telemetry' });
    }
  })
);

// ==================== AUTHENTICATION ====================

app.post(
  '/api/auth/register',
  rateLimit('auth-register', 15, 60_000),
  asyncHandler(async (req, res) => {
    const { email, password, confirmPassword, fullName, country } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Password and confirm password do not match.' });
    }

    const existing = await db.queryOne(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const siteConfig = await getPublicSiteConfig();
    if (!siteConfig.registrationsOpen) {
      return res.status(403).json({
        error: 'New creator account registrations are currently paused by the site administrator.',
      });
    }

    const passwordHash = hashPasswordSync(password);
    const trimmedName = String(fullName || cleanEmail.split('@')[0]).trim();
    const trimmedCountry = String(country || 'United States').trim();
    const welcomeTitle = siteConfig.welcomeNotifTitle;
    const welcomeBody = formatWelcomeMessage(siteConfig.welcomeNotifMessage, trimmedName);

    const userId = await db.transaction(async (tx) => {
      const uid = await tx.insert(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, [
        cleanEmail,
        passwordHash,
      ]);
      await tx.execute(`INSERT INTO user_profiles (user_id, full_name, country) VALUES (?, ?, ?)`, [
        uid,
        trimmedName,
        trimmedCountry,
      ]);
      await tx.execute(
        `INSERT INTO notifications (user_id, title, message, category, link_path)
         VALUES (?, ?, ?, 'system', '/submit')`,
        [uid, welcomeTitle, welcomeBody]
      );
      return uid;
    });

    const token = signSessionToken(userId, cleanEmail);
    setSessionCookie(res, token, req);
    await writeAuditLog(userId, cleanEmail, 'user_registered', 'user', userId, {}, req.ip || '');

    res.status(201).json({
      sessionToken: token,
      user: {
        id: userId,
        email: cleanEmail,
        fullName: trimmedName,
        isAdmin: false,
        adminRole: null,
        permissions: [],
        isVip: false,
        vipExpiresAt: null,
      },
    });
  })
);

app.post(
  '/api/auth/login',
  rateLimit('auth-login', 20, 60_000),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const row = await db.queryOne<Record<string, any>>(
      `SELECT u.id, u.email, u.password_hash, u.status, COALESCE(p.full_name, '') AS full_name,
              COALESCE(p.vip_status, 'none') AS vip_status,
              COALESCE(p.vip_expires_at, '') AS vip_expires_at,
              a.id AS admin_id, r.name AS role_name, r.permissions_json
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN admin_users a ON a.user_id = u.id AND a.is_active = 1
       LEFT JOIN roles r ON r.id = a.role_id
       WHERE u.email = ?`,
      [cleanEmail]
    );

    if (!row || !verifyPasswordSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (row.status !== 'active') {
      return res.status(403).json({ error: 'This account is suspended. Contact Vantage Reach support.' });
    }

    const userId = Number(row.id);
    const token = signSessionToken(userId, row.email);
    setSessionCookie(res, token, req);
    await writeAuditLog(userId, row.email, 'user_login', 'user', userId, {}, req.ip || '');

    let permissions: string[] = [];
    if (row.admin_id && row.permissions_json) {
      try {
        permissions = JSON.parse(row.permissions_json);
      } catch {
        permissions = [];
      }
    }

    const vipExpiry = row.vip_expires_at ? String(row.vip_expires_at).trim() : '';
    const isVip = row.vip_status === 'active' && (!vipExpiry || new Date(vipExpiry).getTime() > Date.now());

    res.json({
      sessionToken: token,
      user: {
        id: userId,
        email: row.email,
        fullName: row.full_name,
        isAdmin: Boolean(row.admin_id),
        adminRole: row.role_name || null,
        permissions,
        isVip,
        vipExpiresAt: vipExpiry || null,
      },
    });
  })
);

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

app.post(
  '/api/auth/forgot-password',
  rateLimit('auth-forgot', 10, 60_000),
  asyncHandler(async (req, res) => {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await db.queryOne<{ id: number; email: string }>(
      `SELECT id, email FROM users WHERE email = ?`,
      [cleanEmail]
    );

    if (!user) {
      return res.json({
        ok: true,
        message: 'If an account exists for that email, a password reset code has been generated.',
      });
    }

    const userId = Number(user.id);
    const rawToken = crypto.randomBytes(16).toString('hex').toUpperCase();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

    await db.execute(
      `UPDATE users SET reset_token_hash = ?, reset_expires_at = ?, updated_at = ${sqlNow()} WHERE id = ?`,
      [tokenHash, expiresAt, userId]
    );
    await writeAuditLog(userId, user.email, 'password_reset_requested', 'user', userId, {}, req.ip || '');

    res.json({
      ok: true,
      message: 'Password reset token generated (valid for 30 minutes).',
      resetTokenPreview: rawToken,
      expiresAt,
    });
  })
);

app.post(
  '/api/auth/reset-password',
  rateLimit('auth-reset', 10, 60_000),
  asyncHandler(async (req, res) => {
    const { email, token, newPassword, confirmPassword } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanToken = String(token || '').trim().toUpperCase();

    if (!cleanEmail || !cleanToken) {
      return res.status(400).json({ error: 'Email and reset token are required.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    const user = await db.queryOne<{
      id: number;
      email: string;
      reset_token_hash: string | null;
      reset_expires_at: string | null;
    }>(`SELECT id, email, reset_token_hash, reset_expires_at FROM users WHERE email = ?`, [cleanEmail]);

    if (!user || !user.reset_token_hash || user.reset_token_hash !== tokenHash) {
      return res.status(400).json({ error: 'Invalid password reset token.' });
    }
    if (!user.reset_expires_at || new Date(user.reset_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    const userId = Number(user.id);
    const nextHash = hashPasswordSync(newPassword);
    await db.execute(
      `UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL, updated_at = ${sqlNow()} WHERE id = ?`,
      [nextHash, userId]
    );

    await writeAuditLog(userId, user.email, 'password_reset_completed', 'user', userId, {}, req.ip || '');
    res.json({ ok: true, message: 'Password updated successfully. You can now sign in.' });
  })
);

// ==================== PROFILE & NOTIFICATIONS ====================

app.get(
  '/api/profile',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const profile = await db.queryOne(
      `SELECT u.id, u.email, u.created_at, p.full_name, p.phone, p.country, p.channel_handle, p.notify_email, p.notify_in_app
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
      [req.user!.id]
    );
    res.json({ profile });
  })
);

app.put(
  '/api/profile',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { fullName, phone, country, channelHandle, notifyEmail, notifyInApp } = req.body || {};
    await db.execute(
      `UPDATE user_profiles
       SET full_name = ?, phone = ?, country = ?, channel_handle = ?,
           notify_email = ?, notify_in_app = ?, updated_at = ${sqlNow()}
       WHERE user_id = ?`,
      [
        String(fullName || '').trim(),
        String(phone || '').trim(),
        String(country || 'United States').trim(),
        String(channelHandle || '').trim(),
        notifyEmail ? 1 : 0,
        notifyInApp ? 1 : 0,
        req.user!.id,
      ]
    );
    const updated = await db.queryOne(
      `SELECT u.id, u.email, u.created_at, p.full_name, p.phone, p.country, p.channel_handle, p.notify_email, p.notify_in_app
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [req.user!.id]
    );
    res.json({ profile: updated });
  })
);

app.post(
  '/api/profile/change-password',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match.' });
    }
    const userRow = await db.queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      [req.user!.id]
    );
    if (!userRow || !verifyPasswordSync(String(currentPassword || ''), userRow.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    await db.execute(`UPDATE users SET password_hash = ?, updated_at = ${sqlNow()} WHERE id = ?`, [
      hashPasswordSync(newPassword),
      req.user!.id,
    ]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/notifications',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    let rows = await db.queryAll(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40`,
      [req.user!.id]
    );
    if (rows.length === 0 && !req.user!.isAdmin) {
      const displayName = (req.user!.fullName || '').trim() || 'Creator';
      const siteConfig = await getPublicSiteConfig();
      await db.execute(
        `INSERT INTO notifications (user_id, title, message, category, link_path)
         VALUES (?, ?, ?, 'system', '/submit')`,
        [
          req.user!.id,
          siteConfig.welcomeNotifTitle,
          formatWelcomeMessage(siteConfig.welcomeNotifMessage, displayName),
        ]
      );
      rows = await db.queryAll(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40`,
        [req.user!.id]
      );
    }
    res.json({ notifications: rows });
  })
);

app.post(
  '/api/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    await db.execute(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [
      Number(req.params.id),
      req.user!.id,
    ]);
    res.json({ ok: true });
  })
);

app.post(
  '/api/notifications/read-all',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    await db.execute(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [req.user!.id]);
    res.json({ ok: true });
  })
);

app.post(
  '/api/support',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { subject, message } = req.body || {};
    if (!String(subject || '').trim() || !String(message || '').trim()) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'support_ticket_submitted',
      'support',
      req.user!.id,
      { subject: String(subject).trim(), message: String(message).trim() },
      req.ip || ''
    );
    await db.execute(
      `INSERT INTO notifications (user_id, title, message, category, link_path)
       VALUES (?, 'Support Request Received', ?, 'support', '/profile')`,
      [req.user!.id, `Your inquiry "${String(subject).trim()}" has been logged for Vantage Reach support.`]
    );
    res.json({ ok: true });
  })
);

// ==================== DASHBOARD ====================

app.get(
  '/api/dashboard',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const uid = req.user!.id;

    const [
      campaignCounts,
      spendingRow,
      videoStatsRow,
      recentCampaigns,
      recentVideosRaw,
      unreadRow,
      campaignReportRow,
    ] = await Promise.all([
      db.queryOne<{ total: number | string; active: number | string | null; completed: number | string | null }>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status IN ('under_review','approved','scheduled','in_progress') THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
         FROM campaigns WHERE user_id = ?`,
        [uid]
      ),
      db.queryOne<{ total_spent: number | string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total_spent
         FROM payments WHERE user_id = ? AND status = 'verified'`,
        [uid]
      ),
      db.queryOne<{ video_count: number | string; total_views: number | string }>(
        `SELECT COUNT(*) AS video_count, COALESCE(SUM(COALESCE(latest_views, 0)), 0) AS total_views
         FROM videos WHERE user_id = ?`,
        [uid]
      ),
      db.queryAll(
        `SELECT c.*, v.title AS video_title, v.url AS video_url, v.channel_url, v.thumbnail_url, v.youtube_video_id, p.name AS package_name
         FROM campaigns c
         JOIN videos v ON v.id = c.video_id
         LEFT JOIN packages p ON p.id = c.package_id
         WHERE c.user_id = ?
         ORDER BY c.created_at DESC LIMIT 5`,
        [uid]
      ),
      db.queryAll<Record<string, any>>(
        `SELECT v.*,
                b.view_count AS baseline_views, b.captured_at AS baseline_at
         FROM videos v
         LEFT JOIN video_snapshots b ON b.video_id = v.id AND b.is_baseline = 1
         WHERE v.user_id = ?
         ORDER BY v.created_at DESC LIMIT 6`,
        [uid]
      ),
      db.queryOne<{ c: number | string }>(
        `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0`,
        [uid]
      ),
      db.queryOne<{ c: number | string }>(
        `SELECT COUNT(*) AS c
         FROM campaign_reports r
         JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.user_id = ?`,
        [uid]
      ),
    ]);

    const videoCount = Number(videoStatsRow?.video_count || 0);
    const reportCount = Number(campaignReportRow?.c || 0);

    res.json({
      stats: {
        totalCampaigns: Number(campaignCounts?.total || 0),
        activeCampaigns: Number(campaignCounts?.active || 0),
        completedCampaigns: Number(campaignCounts?.completed || 0),
        totalSpending: Number(spendingRow?.total_spent || 0),
        totalVideos: videoCount,
        totalTrackedViews: Number(videoStatsRow?.total_views || 0),
        availableReports: videoCount + reportCount,
        unreadNotifications: Number(unreadRow?.c || 0),
      },
      recentCampaigns,
      recentVideos: recentVideosRaw.map(normalizeVideoRow),
    });
  })
);

// ==================== VIDEOS & IMMUTABLE BASELINE SNAPSHOTS ====================

app.post(
  '/api/videos/detect',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const { link, url, channelUrl, title } = req.body || {};
      const primaryRaw = String(link || url || channelUrl || '').trim();
      const parsed = parseFlexibleYouTubeLink(primaryRaw);
      if (!parsed.valid) {
        return res.status(400).json({ error: parsed.error, code: 'INVALID_URL' });
      }
      if (parsed.kind === 'channel') {
        const details = buildChannelSubmissionDetails({
          uniqueKey: parsed.uniqueKey,
          channelUrl: parsed.canonicalUrl,
          channelNameGuess: parsed.channelNameGuess,
          customTitle: typeof title === 'string' ? title : undefined,
        });
        return res.json({ preview: details });
      }
      const chCheck = channelUrl ? validateYouTubeChannelUrl(String(channelUrl)) : null;
      const details = await fetchYouTubeSubmissionDetails({
        videoId: parsed.videoId,
        channelUrl: chCheck?.valid && chCheck.canonicalUrl ? chCheck.canonicalUrl : undefined,
        channelNameGuess: chCheck?.valid ? chCheck.channelNameGuess : undefined,
        customTitle: typeof title === 'string' ? title : undefined,
      });
      res.json({ preview: details });
    } catch (err: any) {
      const status = typeof err.status === 'number' ? err.status : 400;
      res.status(status).json({
        error: err.message || 'Unable to parse YouTube link.',
        code: err.code || 'DETECTION_FAILED',
      });
    }
  })
);

app.post(
  '/api/videos',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const { link, url, channelUrl, title } = req.body || {};
      const customTitle = typeof title === 'string' ? title.trim().slice(0, 180) : '';

      let videoId: string | null = null;
      let resolvedChannelUrl: string | undefined;
      let resolvedChannelName = '';
      let uniqueKey = '';

      const rawCandidates = [link, url, channelUrl]
        .map((v) => String(v || '').trim())
        .filter(Boolean);

      if (rawCandidates.length === 0) {
        return res.status(400).json({
          error: 'Please paste a YouTube channel link or video link.',
          code: 'INVALID_URL',
        });
      }

      for (const candidate of rawCandidates) {
        const parsed = parseFlexibleYouTubeLink(candidate);
        if (!parsed.valid) {
          return res.status(400).json({ error: parsed.error, code: 'INVALID_URL' });
        }
        if (parsed.kind === 'video' && !videoId) {
          videoId = parsed.videoId;
          uniqueKey = parsed.videoId;
        } else if (parsed.kind === 'channel') {
          resolvedChannelUrl = parsed.canonicalUrl;
          resolvedChannelName = parsed.channelNameGuess;
          if (!uniqueKey) uniqueKey = parsed.uniqueKey;
        }
      }

      if (!uniqueKey) {
        return res.status(400).json({
          error: 'Please paste a valid YouTube channel link or video link.',
          code: 'INVALID_URL',
        });
      }

      const existing = await db.queryOne<Record<string, any>>(
        `SELECT * FROM videos WHERE user_id = ? AND youtube_video_id = ?`,
        [req.user!.id, uniqueKey]
      );

      if (existing) {
        await db.execute(
          `UPDATE videos
           SET channel_url = CASE WHEN ? != '' THEN ? ELSE channel_url END,
               title = CASE WHEN ? != '' THEN ? ELSE title END,
               updated_at = ${sqlNow()}
           WHERE id = ?`,
          [resolvedChannelUrl || '', resolvedChannelUrl || '', customTitle, customTitle, Number(existing.id)]
        );
        const refreshed = await db.queryOne<Record<string, any>>(`SELECT * FROM videos WHERE id = ?`, [
          Number(existing.id),
        ]);
        return res.status(200).json({
          video: normalizeVideoRow(refreshed),
          alreadySaved: true,
        });
      }

      const details = videoId
        ? await fetchYouTubeSubmissionDetails({
            videoId,
            channelUrl: resolvedChannelUrl,
            channelNameGuess: resolvedChannelName || undefined,
            customTitle: customTitle || undefined,
          })
        : buildChannelSubmissionDetails({
            uniqueKey,
            channelUrl: resolvedChannelUrl!,
            channelNameGuess: resolvedChannelName || 'YouTube Channel',
            customTitle: customTitle || undefined,
          });

      const insertedId = await db.transaction(async (tx) => {
        const newVideoId = await tx.insert(
          `INSERT INTO videos (
             user_id, youtube_video_id, url, title, description, channel_id, channel_name, channel_url,
             thumbnail_url, duration, published_at, latest_views, latest_likes, latest_comments,
             latest_subscribers, subscribers_hidden, stats_source, last_synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sqlNow()})`,
          [
            req.user!.id,
            details.youtubeVideoId,
            details.url,
            details.title,
            details.description,
            details.channelId,
            details.channelName,
            details.channelUrl || resolvedChannelUrl || '',
            details.thumbnailUrl,
            details.duration,
            details.publishedAt,
            details.viewCount,
            details.likeCount,
            details.commentCount,
            details.subscriberCount,
            details.subscribersHidden ? 1 : 0,
            details.statsSource,
          ]
        );

        await tx.execute(
          `INSERT INTO video_snapshots (
             video_id, user_id, campaign_id, is_baseline, original_title, original_description,
             view_count, like_count, comment_count, subscriber_count, subscribers_hidden, source
           ) VALUES (?, ?, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newVideoId,
            req.user!.id,
            details.title,
            details.description,
            details.viewCount,
            details.likeCount,
            details.commentCount,
            details.subscriberCount,
            details.subscribersHidden ? 1 : 0,
            details.statsSource,
          ]
        );

        await tx.execute(
          `INSERT INTO notifications (user_id, title, message, category, link_path)
           VALUES (?, 'Promotion Link Saved', ?, 'video', ?)`,
          [
            req.user!.id,
            `Your YouTube link (${details.channelUrl || details.url}) is saved and ready to promote.`,
            '/plans',
          ]
        );

        return newVideoId;
      });

      const saved = await db.queryOne<Record<string, any>>(`SELECT * FROM videos WHERE id = ?`, [insertedId]);
      res.status(201).json({ video: normalizeVideoRow(saved), apiNotice: details.apiNotice });
    } catch (err: any) {
      const status = typeof err.status === 'number' ? err.status : 400;
      res.status(status).json({
        error: err.message || 'Failed to save your YouTube link.',
        code: err.code || 'SUBMISSION_FAILED',
      });
    }
  })
);

app.get(
  '/api/videos',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const videos = await db.queryAll<Record<string, any>>(
      `SELECT v.*,
              b.view_count AS baseline_views, b.like_count AS baseline_likes,
              b.comment_count AS baseline_comments, b.subscriber_count AS baseline_subscribers,
              b.captured_at AS baseline_captured_at,
              (SELECT COUNT(*) FROM video_snapshots s WHERE s.video_id = v.id) AS snapshot_count,
              (SELECT COUNT(*) FROM seo_analyses a WHERE a.video_id = v.id) AS seo_count
       FROM videos v
       LEFT JOIN video_snapshots b ON b.video_id = v.id AND b.is_baseline = 1
       WHERE v.user_id = ?
       ORDER BY v.created_at DESC`,
      [req.user!.id]
    );
    res.json({ videos: videos.map(normalizeVideoRow) });
  })
);

app.get(
  '/api/videos/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const vid = Number(req.params.id);
    const videoRaw = await db.queryOne<Record<string, any>>(
      `SELECT * FROM videos WHERE id = ? AND user_id = ?`,
      [vid, req.user!.id]
    );

    if (!videoRaw) {
      return res.status(404).json({ error: 'Video not found.' });
    }
    const video = normalizeVideoRow(videoRaw)!;

    const [snapshotsRaw, seoAnalyses, kwRows, competitorsRaw, campaigns] = await Promise.all([
      db.queryAll<Record<string, any>>(
        `SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at ASC, id ASC`,
        [vid]
      ),
      db.queryAll<Record<string, any>>(
        `SELECT * FROM seo_analyses WHERE video_id = ? ORDER BY created_at DESC, id DESC`,
        [vid]
      ),
      db.queryAll<Record<string, any>>(`SELECT * FROM keyword_suggestions WHERE video_id = ? ORDER BY id ASC`, [vid]),
      db.queryAll<Record<string, any>>(
        `SELECT * FROM competitor_results WHERE video_id = ? ORDER BY retrieved_at DESC, result_position ASC`,
        [vid]
      ),
      db.queryAll<Record<string, any>>(
        `SELECT c.*, p.name AS package_name
         FROM campaigns c LEFT JOIN packages p ON p.id = c.package_id
         WHERE c.video_id = ? ORDER BY c.created_at DESC`,
        [vid]
      ),
    ]);

    const snapshots = snapshotsRaw.map((s) => normalizeSnapshotRow(s)!);
    const baseline = snapshots.find((s) => s.is_baseline === 1) || snapshots[0] || null;
    const latest = snapshots[snapshots.length - 1] || baseline;

    const delta = {
      views:
        baseline && latest && baseline.view_count !== null && latest.view_count !== null
          ? latest.view_count - baseline.view_count
          : null,
      likes:
        baseline && latest && baseline.like_count !== null && latest.like_count !== null
          ? latest.like_count - baseline.like_count
          : null,
      comments:
        baseline && latest && baseline.comment_count !== null && latest.comment_count !== null
          ? latest.comment_count - baseline.comment_count
          : null,
      subscribers:
        baseline && latest && baseline.subscriber_count !== null && latest.subscriber_count !== null
          ? latest.subscriber_count - baseline.subscriber_count
          : null,
    };

    const keywordsByAnalysis = new Map<number, any[]>();
    for (const k of kwRows) {
      const aid = Number(k.seo_analysis_id);
      const arr = keywordsByAnalysis.get(aid) || [];
      arr.push(k);
      keywordsByAnalysis.set(aid, arr);
    }

    const formattedAnalyses = seoAnalyses.map((a) => {
      let structuredAssessment: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(a.structured_assessment_json || '{}');
        if (parsed && Object.keys(parsed).length > 0) structuredAssessment = parsed;
      } catch {
        structuredAssessment = null;
      }
      return {
        ...a,
        id: Number(a.id),
        searchPhrases: JSON.parse(a.search_phrases_json || '[]'),
        titleAlternatives: JSON.parse(a.title_alternatives_json || '[]'),
        hashtags: JSON.parse(a.hashtags_json || '[]'),
        contentRecommendations: JSON.parse(a.content_recommendations_json || '[]'),
        keywords: keywordsByAnalysis.get(Number(a.id)) || [],
        structuredAssessment,
      };
    });

    const competitors = competitorsRaw.map((c) => ({
      ...c,
      id: Number(c.id),
      view_count: toNullableNum(c.view_count),
      result_position: Number(c.result_position || 0),
    }));

    res.json({
      video,
      baseline,
      latest,
      delta,
      snapshots,
      seoAnalyses: formattedAnalyses,
      competitors,
      campaigns,
    });
  })
);

app.post(
  '/api/videos/:id/refresh',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const vid = Number(req.params.id);
      const video = await db.queryOne<{ id: number; youtube_video_id: string }>(
        `SELECT * FROM videos WHERE id = ? AND user_id = ?`,
        [vid, req.user!.id]
      );

      if (!video) {
        return res.status(404).json({ error: 'Video not found.' });
      }

      const details = await fetchYouTubeVideoDetails(video.youtube_video_id);
      const activeCampaign = await db.queryOne<{ id: number }>(
        `SELECT id FROM campaigns WHERE video_id = ? AND status IN ('approved','scheduled','in_progress') ORDER BY id DESC LIMIT 1`,
        [vid]
      );

      await db.transaction(async (tx) => {
        const nowExpr = sqlNow();
        await tx.execute(
          `UPDATE videos
           SET title = ?, description = ?, channel_name = ?, thumbnail_url = ?, duration = ?,
               latest_views = ?, latest_likes = ?, latest_comments = ?, latest_subscribers = ?,
               subscribers_hidden = ?, stats_source = ?, last_synced_at = ${nowExpr}, updated_at = ${nowExpr}
           WHERE id = ?`,
          [
            details.title,
            details.description,
            details.channelName,
            details.thumbnailUrl,
            details.duration,
            details.viewCount,
            details.likeCount,
            details.commentCount,
            details.subscriberCount,
            details.subscribersHidden ? 1 : 0,
            details.statsSource,
            vid,
          ]
        );

        await tx.execute(
          `INSERT INTO video_snapshots (
             video_id, user_id, campaign_id, is_baseline, original_title, original_description,
             view_count, like_count, comment_count, subscriber_count, subscribers_hidden, source
           ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            vid,
            req.user!.id,
            activeCampaign?.id ? Number(activeCampaign.id) : null,
            details.title,
            details.description,
            details.viewCount,
            details.likeCount,
            details.commentCount,
            details.subscriberCount,
            details.subscribersHidden ? 1 : 0,
            details.statsSource,
          ]
        );
      });

      res.json({ ok: true, apiNotice: details.apiNotice });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to refresh YouTube statistics.' });
    }
  })
);

// ==================== COMPETITOR RESEARCH ====================

app.post(
  '/api/videos/:id/competitors/search',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const vid = Number(req.params.id);
      const video = await db.queryOne<{ id: number; youtube_video_id: string }>(
        `SELECT * FROM videos WHERE id = ? AND user_id = ?`,
        [vid, req.user!.id]
      );

      if (!video) {
        return res.status(404).json({ error: 'Video not found.' });
      }

      const rawPhrases: string[] = Array.isArray(req.body?.searchPhrases)
        ? req.body.searchPhrases.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : req.body?.searchPhrase
          ? [String(req.body.searchPhrase).trim()]
          : [];

      if (rawPhrases.length === 0) {
        return res.status(400).json({ error: 'Enter at least one search phrase to analyze competitors.' });
      }

      const limitedPhrases = rawPhrases.slice(0, 3);
      const allResults: any[] = [];
      let regionUsed = 'US';

      for (const phrase of limitedPhrases) {
        const { items, regionCode } = await searchYouTubeCompetitors(phrase, 8);
        regionUsed = regionCode;

        await db.transaction(async (tx) => {
          await tx.execute(`DELETE FROM competitor_results WHERE video_id = ? AND search_phrase = ?`, [vid, phrase]);
          for (const item of items) {
            await tx.execute(
              `INSERT INTO competitor_results (
                 video_id, user_id, search_phrase, competitor_video_id, title, channel_name,
                 thumbnail_url, view_count, published_at, result_position, source
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                vid,
                req.user!.id,
                item.searchPhrase,
                item.competitorVideoId,
                item.title,
                item.channelName,
                item.thumbnailUrl,
                item.viewCount,
                item.publishedAt,
                item.resultPosition,
                item.source,
              ]
            );
          }
        });

        allResults.push(...items);
      }

      res.json({
        results: allResults,
        regionCode: regionUsed,
        disclaimer:
          'YouTube Data API v3 search positions reflect an unpersonalized API query for the configured region at this timestamp. Actual YouTube search results vary by viewer location, language, watch history, personalization, and time.',
      });
    } catch (err: any) {
      const status = err.code === 'YOUTUBE_API_KEY_MISSING' ? 428 : 400;
      res.status(status).json({ error: err.message || 'Competitor search failed.', code: err.code });
    }
  })
);

// ==================== GEMINI AI SEO INTELLIGENCE ====================

app.post(
  '/api/videos/:id/seo/analyze',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const vid = Number(req.params.id);
      const video = await db.queryOne<Record<string, any>>(
        `SELECT * FROM videos WHERE id = ? AND user_id = ?`,
        [vid, req.user!.id]
      );

      if (!video) {
        return res.status(404).json({ error: 'Video not found.' });
      }

      const videoTopic = String(req.body?.videoTopic || video.title).trim();
      const targetAudience = String(req.body?.targetAudience || 'International YouTube viewers').trim();
      const searchPhrases: string[] = Array.isArray(req.body?.searchPhrases)
        ? req.body.searchPhrases.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : [];

      const competitorsRaw = await db.queryAll<{
        title: string;
        channelName: string;
        viewCount: number | string | null;
        resultPosition: number | string;
        searchPhrase: string;
      }>(
        `SELECT title,
                channel_name AS "channelName",
                view_count AS "viewCount",
                result_position AS "resultPosition",
                search_phrase AS "searchPhrase"
         FROM competitor_results
         WHERE video_id = ?
         ORDER BY retrieved_at DESC, result_position ASC
         LIMIT 10`,
        [vid]
      );

      const competitors = competitorsRaw.map((c) => ({
        title: c.title,
        channelName: c.channelName,
        viewCount: toNullableNum(c.viewCount),
        resultPosition: Number(c.resultPosition || 0),
        searchPhrase: c.searchPhrase,
      }));

      const analysis = await generateYouTubeSeoAnalysis({
        videoTitle: video.title,
        description: video.description || '',
        videoTopic,
        targetAudience,
        searchPhrases,
        competitors,
        publicStats: {
          viewCount: toNullableNum(video.latest_views),
          likeCount: toNullableNum(video.latest_likes),
          commentCount: toNullableNum(video.latest_comments),
          subscriberCount: toNullableNum(video.latest_subscribers),
          subscribersHidden: Boolean(video.subscribers_hidden),
          duration: video.duration || '',
        },
        thumbnailUrl: video.thumbnail_url,
      });

      const analysisId = await db.transaction(async (tx) => {
        const newId = await tx.insert(
          `INSERT INTO seo_analyses (
             video_id, user_id, target_audience, search_phrases_json, topic_assessment,
             main_keyword, search_intent, title_clarity_notes, description_structure_notes,
             thumbnail_suitability_notes, title_alternatives_json, recommended_description,
             hashtags_json, content_recommendations_json, limitations_notes, structured_assessment_json,
             model_used, data_provenance
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'gemini_ai_analysis')`,
          [
            vid,
            req.user!.id,
            targetAudience,
            JSON.stringify(searchPhrases),
            analysis.topicAssessment,
            analysis.mainKeyword,
            analysis.searchIntent,
            analysis.titleClarityNotes,
            analysis.descriptionStructureNotes,
            analysis.thumbnailSuitabilityNotes,
            JSON.stringify(analysis.titleAlternatives),
            analysis.recommendedDescription,
            JSON.stringify(analysis.suggestedHashtags),
            JSON.stringify(analysis.contentRecommendations),
            analysis.limitationsAndConfidenceNotes,
            JSON.stringify(analysis.structuredAssessment),
            analysis.modelUsed,
          ]
        );

        const kwSql = `INSERT INTO keyword_suggestions (seo_analysis_id, video_id, keyword_text, category, rationale, is_ai_generated)
                       VALUES (?, ?, ?, ?, ?, 1)`;
        await tx.execute(kwSql, [
          newId,
          vid,
          analysis.mainKeyword,
          'main',
          analysis.structuredAssessment.primaryKeywordRationale || 'Primary focus keyword derived by Gemini',
        ]);
        for (const rk of analysis.relatedKeywords) {
          await tx.execute(kwSql, [newId, vid, rk.keyword, 'related', rk.rationale]);
        }
        for (const lk of analysis.longTailKeywords) {
          await tx.execute(kwSql, [newId, vid, lk.keyword, 'long_tail', lk.rationale]);
        }
        return newId;
      });

      const saved = (await db.queryOne<Record<string, any>>(`SELECT * FROM seo_analyses WHERE id = ?`, [analysisId]))!;
      const keywords = await db.queryAll(`SELECT * FROM keyword_suggestions WHERE seo_analysis_id = ?`, [analysisId]);

      res.status(201).json({
        analysis: {
          ...saved,
          id: Number(saved.id),
          searchPhrases: JSON.parse(saved.search_phrases_json || '[]'),
          titleAlternatives: JSON.parse(saved.title_alternatives_json || '[]'),
          hashtags: JSON.parse(saved.hashtags_json || '[]'),
          contentRecommendations: JSON.parse(saved.content_recommendations_json || '[]'),
          keywords,
          structuredAssessment: analysis.structuredAssessment,
        },
      });
    } catch (err: any) {
      const status = err.code === 'GEMINI_API_KEY_MISSING' ? 503 : 500;
      res.status(status).json({ error: err.message || 'Gemini SEO analysis failed.', code: err.code });
    }
  })
);

app.post(
  '/api/seo/:analysisId/save',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const analysisId = Number(req.params.analysisId);
    const row = await db.queryOne(`SELECT id FROM seo_analyses WHERE id = ? AND user_id = ?`, [
      analysisId,
      req.user!.id,
    ]);
    if (!row) {
      return res.status(404).json({ error: 'SEO analysis not found.' });
    }
    await db.execute(`UPDATE seo_analyses SET saved_by_user = 1 WHERE id = ?`, [analysisId]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/seo/orders',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const orders = await db.queryAll(
      `SELECT o.*, v.title AS video_title, v.thumbnail_url
       FROM seo_orders o
       JOIN videos v ON v.id = o.video_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [req.user!.id]
    );
    res.json({ orders });
  })
);

// ==================== PACKAGES, CHECKOUT & PAYMENTS ====================

app.get(
  '/api/packages',
  asyncHandler(async (_req, res) => {
    const [rows, gatewayStatus] = await Promise.all([
      db.queryAll<Record<string, any>>(`SELECT * FROM packages WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`),
      getPaymentGatewayStatus(),
    ]);
    const packages = rows.map((r) => ({
      ...r,
      id: Number(r.id),
      code: String(r.code || ''),
      duration_days: Number(r.duration_days || 0),
      price_usd: Number(r.price_usd || 0),
      price_ngn: Number(r.price_ngn || 0),
      is_active: Number(r.is_active || 0),
      deliverables: JSON.parse(r.deliverables_json || '[]'),
    }));
    const vipPackage = packages.find((p) => p.code === 'vip_membership') || null;
    res.json({
      packages,
      vipPackage,
      defaultProvider: gatewayStatus.defaultProvider,
      flutterwaveConfigured: gatewayStatus.flutterwaveConfigured,
      paystackConfigured: gatewayStatus.paystackConfigured,
    });
  })
);

app.post(
  '/api/checkout',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const { packageId, videoId, currency, provider, idempotencyKey, targetRegions, seoAnalysisId, notes } =
        req.body || {};

      const pkg = await db.queryOne<Record<string, any>>(
        `SELECT * FROM packages WHERE id = ? AND is_active = 1`,
        [Number(packageId)]
      );
      if (!pkg) {
        return res.status(404).json({ error: 'Selected package is no longer available.' });
      }

      const video = await db.queryOne<Record<string, any>>(
        `SELECT * FROM videos WHERE id = ? AND user_id = ?`,
        [Number(videoId), req.user!.id]
      );
      if (!video) {
        return res.status(404).json({ error: 'Please select one of your submitted YouTube videos.' });
      }

      const chosenCurrency: 'USD' | 'NGN' = currency === 'NGN' ? 'NGN' : 'USD';
      const amount = chosenCurrency === 'NGN' ? Number(pkg.price_ngn) : Number(pkg.price_usd);
      const chosenProvider: PaymentProviderName =
        provider === 'paystack' || provider === 'flutterwave' || provider === 'sandbox'
          ? provider
          : await getActiveDefaultProvider();

      const idemKey = String(idempotencyKey || `idem-${req.user!.id}-${pkg.id}-${video.id}-${Date.now()}`);

      if (pkg.kind === 'promotion') {
        const campaignRef = `CMP-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const campaignId = await db.transaction(async (tx) => {
          const cid = await tx.insert(
            `INSERT INTO campaigns (
               user_id, video_id, package_id, campaign_ref, title, duration_days,
               amount_paid, currency, payment_status, status, target_regions, deliverables_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'awaiting_payment', ?, ?)`,
            [
              req.user!.id,
              Number(video.id),
              Number(pkg.id),
              campaignRef,
              `${pkg.name}: ${String(video.title).slice(0, 60)}`,
              Number(pkg.duration_days),
              amount,
              chosenCurrency,
              String(targetRegions || 'Global').trim(),
              pkg.deliverables_json,
            ]
          );
          await tx.execute(
            `INSERT INTO campaign_activities (campaign_id, actor_type, actor_id, activity_type, summary, details)
             VALUES (?, 'customer', ?, 'campaign_created', 'Campaign created awaiting payment verification', ?)`,
            [cid, req.user!.id, `Selected ${pkg.name} (${chosenCurrency} ${amount}).`]
          );
          return cid;
        });

        const appUrl = getAppBaseUrl(req);
        const siteCfg = await getPublicSiteConfig();
        const returnTab = 'campaigns';
        const init = await initializePayment({
          userId: req.user!.id,
          email: req.user!.email,
          campaignId,
          amount,
          currency: chosenCurrency,
          provider: chosenProvider,
          idempotencyKey: idemKey,
          callbackUrl: `${appUrl}/?tab=${returnTab}`,
          description: `${siteCfg.appName} — ${pkg.name}`,
        });

        return res.status(201).json({
          kind: 'promotion',
          campaignId,
          campaignRef,
          ...init,
        });
      } else {
        const orderRef = `SEO-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const isFree = amount <= 0;

        const orderId = await db.insert(
          `INSERT INTO seo_orders (
             user_id, video_id, package_id, seo_analysis_id, order_ref, service_code,
             service_name, amount, currency, payment_status, order_status, notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user!.id,
            Number(video.id),
            Number(pkg.id),
            seoAnalysisId ? Number(seoAnalysisId) : null,
            orderRef,
            pkg.code,
            pkg.name,
            amount,
            chosenCurrency,
            isFree ? 'paid' : 'pending',
            isFree ? 'queued' : 'awaiting_payment',
            String(notes || '').trim(),
          ]
        );

        if (isFree) {
          return res.status(201).json({
            kind: 'seo_service',
            seoOrderId: orderId,
            orderRef,
            freeIncluded: true,
          });
        }

        const appUrl = getAppBaseUrl(req);
        const siteCfg = await getPublicSiteConfig();
        const init = await initializePayment({
          userId: req.user!.id,
          email: req.user!.email,
          seoOrderId: orderId,
          amount,
          currency: chosenCurrency,
          provider: chosenProvider,
          idempotencyKey: idemKey,
          callbackUrl: `${appUrl}/?tab=seo`,
          description: `${siteCfg.appName} — ${pkg.name}`,
        });

        return res.status(201).json({
          kind: 'seo_service',
          seoOrderId: orderId,
          orderRef,
          ...init,
        });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Checkout initialization failed.' });
    }
  })
);

app.post(
  '/api/payments/verify',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const { txRef, simulateOutcome, providerTransactionId } = req.body || {};
      if (!txRef) {
        return res.status(400).json({ error: 'Transaction reference is required.' });
      }
      const owned = await db.queryOne(`SELECT id FROM payments WHERE tx_ref = ? AND user_id = ?`, [
        String(txRef),
        req.user!.id,
      ]);
      if (!owned) {
        return res.status(404).json({ error: 'Payment transaction not found.' });
      }

      const result = await verifyPaymentOnServer(String(txRef), {
        simulateOutcome: simulateOutcome === 'fail' ? 'fail' : 'succeed',
        providerTransactionId: providerTransactionId ? String(providerTransactionId) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Payment verification failed.' });
    }
  })
);

app.post(
  '/api/payments/webhook/:provider',
  asyncHandler(async (req: any, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const isValid = await verifyWebhookSignature(provider, req.rawBody || '', req.headers);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    try {
      const txRef =
        provider === 'paystack'
          ? req.body?.data?.reference
          : provider === 'flutterwave'
            ? req.body?.data?.tx_ref
            : null;
      if (txRef) {
        await verifyPaymentOnServer(String(txRef), {
          viaWebhook: true,
          providerTransactionId: req.body?.data?.id ? String(req.body.data.id) : undefined,
        });
      }
      res.json({ received: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Webhook processing error' });
    }
  })
);

app.get(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const payments = await db.queryAll(
      `SELECT p.*, c.campaign_ref, c.title AS campaign_title, o.order_ref, o.service_name
       FROM payments p
       LEFT JOIN campaigns c ON c.id = p.campaign_id
       LEFT JOIN seo_orders o ON o.id = p.seo_order_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [req.user!.id]
    );
    res.json({ payments });
  })
);

// ==================== CAMPAIGNS & PERFORMANCE REPORTS ====================

app.get(
  '/api/campaigns',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const campaigns = await db.queryAll<Record<string, any>>(
      `SELECT c.*, v.title AS video_title, v.url AS video_url, v.channel_url, v.channel_name, v.thumbnail_url, v.youtube_video_id, v.latest_views,
              p.name AS package_name,
              (SELECT tx_ref FROM payments pay WHERE pay.campaign_id = c.id ORDER BY pay.id DESC LIMIT 1) AS latest_tx_ref
       FROM campaigns c
       JOIN videos v ON v.id = c.video_id
       LEFT JOIN packages p ON p.id = c.package_id
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.user!.id]
    );

    res.json({
      campaigns: campaigns.map((c) => ({
        ...c,
        id: Number(c.id),
        latest_views: toNullableNum(c.latest_views),
        deliverables: JSON.parse(c.deliverables_json || '[]'),
      })),
    });
  })
);

app.get(
  '/api/campaigns/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const cid = Number(req.params.id);
    const campaign = await db.queryOne<Record<string, any>>(
      `SELECT c.*, v.title AS video_title, v.url AS video_url, v.channel_url, v.thumbnail_url, v.youtube_video_id, v.channel_name,
              v.latest_views, v.latest_likes, v.latest_comments, v.latest_subscribers, v.subscribers_hidden,
              p.name AS package_name
       FROM campaigns c
       JOIN videos v ON v.id = c.video_id
       LEFT JOIN packages p ON p.id = c.package_id
       WHERE c.id = ? AND c.user_id = ?`,
      [cid, req.user!.id]
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const [activities, reports, snapshotsRaw, payments] = await Promise.all([
      db.queryAll(`SELECT * FROM campaign_activities WHERE campaign_id = ? ORDER BY created_at DESC, id DESC`, [cid]),
      db.queryAll<Record<string, any>>(`SELECT * FROM campaign_reports WHERE campaign_id = ? ORDER BY created_at DESC`, [
        cid,
      ]),
      db.queryAll<Record<string, any>>(`SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at ASC`, [
        Number(campaign.video_id),
      ]),
      db.queryAll(`SELECT * FROM payments WHERE campaign_id = ? ORDER BY created_at DESC`, [cid]),
    ]);

    res.json({
      campaign: {
        ...campaign,
        id: Number(campaign.id),
        latest_views: toNullableNum(campaign.latest_views),
        latest_likes: toNullableNum(campaign.latest_likes),
        latest_comments: toNullableNum(campaign.latest_comments),
        latest_subscribers: toNullableNum(campaign.latest_subscribers),
        deliverables: JSON.parse(campaign.deliverables_json || '[]'),
      },
      activities,
      reports: reports.map((r) => ({
        ...r,
        id: Number(r.id),
        measured_views_delta: toNullableNum(r.measured_views_delta),
        measured_likes_delta: toNullableNum(r.measured_likes_delta),
        measured_subs_delta: toNullableNum(r.measured_subs_delta),
        deliverablesCompleted: JSON.parse(r.deliverables_completed_json || '[]'),
      })),
      snapshots: snapshotsRaw.map(normalizeSnapshotRow),
      payments,
    });
  })
);

app.post(
  '/api/campaigns/:id/cancel',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const cid = Number(req.params.id);
    const campaign = await db.queryOne<{ id: number; status: string }>(
      `SELECT * FROM campaigns WHERE id = ? AND user_id = ?`,
      [cid, req.user!.id]
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    if (!['awaiting_payment', 'under_review', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({ error: 'Only unstarted campaigns can be cancelled directly.' });
    }

    await db.transaction(async (tx) => {
      await tx.execute(`UPDATE campaigns SET status = 'cancelled', updated_at = ${sqlNow()} WHERE id = ?`, [cid]);
      await tx.execute(
        `INSERT INTO campaign_activities (campaign_id, actor_type, actor_id, activity_type, summary, details)
         VALUES (?, 'customer', ?, 'campaign_cancelled', 'Campaign cancelled by customer', '')`,
        [cid, req.user!.id]
      );
    });
    res.json({ ok: true });
  })
);

app.get(
  '/api/reports/overview',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const range = String(req.query.range || '30d');
    const videoId = req.query.videoId ? Number(req.query.videoId) : null;

    let cutoffClause = '';
    if (range === '7d') cutoffClause = `AND s.captured_at >= ${sqlAgo(7, 'days')}`;
    else if (range === '30d') cutoffClause = `AND s.captured_at >= ${sqlAgo(30, 'days')}`;
    else if (range === '90d') cutoffClause = `AND s.captured_at >= ${sqlAgo(90, 'days')}`;

    const videosRaw = await db.queryAll<Record<string, any>>(
      `SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user!.id]
    );
    const videos = videosRaw.map((v) => normalizeVideoRow(v)!);
    const selectedVideo = videoId ? videos.find((v) => v.id === videoId) || videos[0] : videos[0];

    if (!selectedVideo) {
      return res.json({
        videos: [],
        selectedVideo: null,
        baseline: null,
        latest: null,
        snapshots: [],
        activities: [],
        attributionDisclaimer:
          'Observed increases in public YouTube views, likes, or subscribers may reflect organic discovery, creator uploads, YouTube browse features, and external traffic—not solely Vantage Reach promotion.',
      });
    }

    const [baselineRaw, snapshotsRaw, latestRaw, activities] = await Promise.all([
      db.queryOne<Record<string, any>>(
        `SELECT * FROM video_snapshots WHERE video_id = ? AND is_baseline = 1 LIMIT 1`,
        [selectedVideo.id]
      ),
      db.queryAll<Record<string, any>>(
        `SELECT s.* FROM video_snapshots s
         WHERE s.video_id = ? ${cutoffClause}
         ORDER BY s.captured_at ASC, s.id ASC`,
        [selectedVideo.id]
      ),
      db.queryOne<Record<string, any>>(
        `SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1`,
        [selectedVideo.id]
      ),
      db.queryAll(
        `SELECT ca.*, c.campaign_ref, c.title AS campaign_title
         FROM campaign_activities ca
         JOIN campaigns c ON c.id = ca.campaign_id
         WHERE c.video_id = ? AND c.user_id = ?
         ORDER BY ca.created_at DESC`,
        [selectedVideo.id, req.user!.id]
      ),
    ]);

    const baseline = normalizeSnapshotRow(baselineRaw) || null;
    const latest = normalizeSnapshotRow(latestRaw) || baseline || null;

    res.json({
      videos,
      selectedVideo,
      baseline,
      latest,
      snapshots: snapshotsRaw.map(normalizeSnapshotRow),
      activities,
      attributionDisclaimer:
        'Observed increases in public YouTube views, likes, or subscribers reflect total public YouTube activity and may come from organic discovery, subscriber feeds, and external sharing alongside any Vantage Reach promotion.',
    });
  })
);

app.get(
  '/api/reports/export',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    const videoId = req.query.videoId ? Number(req.query.videoId) : null;

    const snapshotsRaw = await db.queryAll<Record<string, any>>(
      `SELECT v.youtube_video_id, v.title, s.is_baseline, s.view_count, s.like_count, s.comment_count,
              s.subscriber_count, s.source, s.captured_at
       FROM video_snapshots s
       JOIN videos v ON v.id = s.video_id
       WHERE s.user_id = ? ${videoId ? 'AND s.video_id = ?' : ''}
       ORDER BY s.captured_at ASC`,
      videoId ? [req.user!.id, videoId] : [req.user!.id]
    );
    const snapshots: Array<Record<string, any>> = snapshotsRaw.map((r) => ({
      ...r,
      is_baseline: Number(r.is_baseline || 0),
      view_count: toNullableNum(r.view_count),
      like_count: toNullableNum(r.like_count),
      comment_count: toNullableNum(r.comment_count),
      subscriber_count: toNullableNum(r.subscriber_count),
    }));

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="vantage-reach-performance-report.json"');
      return res.send(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            platform: 'Vantage Reach (Vantage Talent Search Global)',
            attributionNote:
              'Public YouTube metrics are measured via YouTube Data API and do not imply 100% causal attribution to Vantage Reach campaigns.',
            snapshots,
          },
          null,
          2
        )
      );
    }

    const header =
      'youtube_video_id,title,is_baseline,view_count,like_count,comment_count,subscriber_count,source,captured_at';
    const lines = snapshots.map((r) =>
      [
        r.youtube_video_id,
        `"${String(r.title || '').replace(/"/g, '""')}"`,
        r.is_baseline,
        r.view_count ?? '',
        r.like_count ?? '',
        r.comment_count ?? '',
        r.subscriber_count ?? '',
        r.source,
        r.captured_at,
      ].join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vantage-reach-performance-report.csv"');
    res.send([header, ...lines].join('\n'));
  })
);

// ==================== ADMIN CONSOLE API (PROTECTED BY RBAC) ====================

app.get(
  '/api/admin/overview',
  requireAuth,
  requireAdmin('overview:read'),
  asyncHandler(async (_req, res) => {
    const [
      customersRow,
      videosRow,
      campaignsRow,
      activeCampaignsRow,
      seoOrdersRow,
      revUsdRow,
      revNgnRow,
      pendingReviewsRow,
      activeVisitorsRow,
      todayVisitorsRow,
    ] = await Promise.all([
      db.queryOne<{ c: number | string }>(`SELECT COUNT(*) AS c FROM users`),
      db.queryOne<{ c: number | string }>(`SELECT COUNT(*) AS c FROM videos`),
      db.queryOne<{ c: number | string }>(`SELECT COUNT(*) AS c FROM campaigns`),
      db.queryOne<{ c: number | string }>(
        `SELECT COUNT(*) AS c FROM campaigns WHERE status IN ('under_review','approved','scheduled','in_progress')`
      ),
      db.queryOne<{ c: number | string }>(`SELECT COUNT(*) AS c FROM seo_orders`),
      db.queryOne<{ s: number | string }>(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE status = 'verified' AND currency = 'USD'`
      ),
      db.queryOne<{ s: number | string }>(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE status = 'verified' AND currency = 'NGN'`
      ),
      db.queryOne<{ c: number | string }>(`SELECT COUNT(*) AS c FROM campaigns WHERE status = 'under_review'`),
      db.queryOne<{ c: number | string }>(
        `SELECT COUNT(DISTINCT visitor_id) AS c FROM visitor_sessions WHERE last_seen_at >= ${sqlAgo(3, 'minutes')}`
      ),
      db.queryOne<{ c: number | string }>(
        `SELECT COUNT(DISTINCT visitor_id) AS c FROM visitor_sessions WHERE last_seen_at >= ${sqlAgo(24, 'hours')}`
      ),
    ]);

    res.json({
      overview: {
        customers: Number(customersRow?.c || 0),
        videos: Number(videosRow?.c || 0),
        campaigns: Number(campaignsRow?.c || 0),
        activeCampaigns: Number(activeCampaignsRow?.c || 0),
        seoOrders: Number(seoOrdersRow?.c || 0),
        verifiedRevenueUsd: Number(revUsdRow?.s || 0),
        verifiedRevenueNgn: Number(revNgnRow?.s || 0),
        pendingReviews: Number(pendingReviewsRow?.c || 0),
        activeVisitorsNow: Number(activeVisitorsRow?.c || 0),
        todayVisitors: Number(todayVisitorsRow?.c || 0),
      },
    });
  })
);

app.get(
  '/api/admin/customers',
  requireAuth,
  requireAdmin('customers:manage'),
  asyncHandler(async (_req, res) => {
    const customersRaw = await db.queryAll<Record<string, any>>(
      `SELECT u.id, u.email, u.status, u.created_at, p.full_name, p.country, p.phone,
              (SELECT COUNT(*) FROM videos v WHERE v.user_id = u.id) AS video_count,
              (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) AS campaign_count,
              (SELECT COALESCE(SUM(amount), 0) FROM payments pay WHERE pay.user_id = u.id AND pay.status = 'verified') AS total_spent
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json({
      customers: customersRaw.map((c) => ({
        ...c,
        id: Number(c.id),
        video_count: Number(c.video_count || 0),
        campaign_count: Number(c.campaign_count || 0),
        total_spent: Number(c.total_spent || 0),
      })),
    });
  })
);

app.patch(
  '/api/admin/customers/:id/status',
  requireAuth,
  requireAdmin('customers:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const targetId = Number(req.params.id);
    const status = req.body?.status === 'suspended' ? 'suspended' : 'active';
    await db.execute(`UPDATE users SET status = ?, updated_at = ${sqlNow()} WHERE id = ?`, [status, targetId]);
    await writeAuditLog(req.user!.id, req.user!.email, 'customer_status_updated', 'user', targetId, { status }, req.ip || '');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/admin/customers/:id',
  requireAuth,
  requireAdmin('customers:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const targetId = Number(req.params.id);
    const { fullName, country, status } = req.body || {};
    const existing = await db.queryOne<{ id: number; status: string }>(`SELECT id, status FROM users WHERE id = ?`, [
      targetId,
    ]);
    if (!existing) return res.status(404).json({ error: 'Customer not found.' });
    const nextStatus = status === 'suspended' ? 'suspended' : status === 'active' ? 'active' : existing.status;

    await db.transaction(async (tx) => {
      await tx.execute(`UPDATE users SET status = ?, updated_at = ${sqlNow()} WHERE id = ?`, [nextStatus, targetId]);
      if (fullName !== undefined || country !== undefined) {
        await tx.execute(
          `UPDATE user_profiles
           SET full_name = COALESCE(?, full_name),
               country = COALESCE(?, country),
               updated_at = ${sqlNow()}
           WHERE user_id = ?`,
          [
            fullName !== undefined ? String(fullName).trim().slice(0, 120) : null,
            country !== undefined ? String(country).trim().slice(0, 80) : null,
            targetId,
          ]
        );
      }
    });
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'customer_updated',
      'user',
      targetId,
      { status: nextStatus },
      req.ip || ''
    );
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/videos',
  requireAuth,
  requireAdmin('videos:read'),
  asyncHandler(async (_req, res) => {
    const videos = await db.queryAll<Record<string, any>>(
      `SELECT v.*, u.email AS owner_email, b.view_count AS baseline_views, b.captured_at AS baseline_at
       FROM videos v
       JOIN users u ON u.id = v.user_id
       LEFT JOIN video_snapshots b ON b.video_id = v.id AND b.is_baseline = 1
       ORDER BY v.created_at DESC`
    );
    res.json({ videos: videos.map(normalizeVideoRow) });
  })
);

app.post(
  '/api/admin/videos/:id/snapshot',
  requireAuth,
  requireAdmin('videos:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const vid = Number(req.params.id);
      const video = await db.queryOne<{ id: number; user_id: number; youtube_video_id: string }>(
        `SELECT * FROM videos WHERE id = ?`,
        [vid]
      );
      if (!video) return res.status(404).json({ error: 'Video not found.' });

      const details = await fetchYouTubeVideoDetails(video.youtube_video_id);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE videos SET latest_views = ?, latest_likes = ?, latest_comments = ?, latest_subscribers = ?,
           subscribers_hidden = ?, stats_source = ?, last_synced_at = ${sqlNow()} WHERE id = ?`,
          [
            details.viewCount,
            details.likeCount,
            details.commentCount,
            details.subscriberCount,
            details.subscribersHidden ? 1 : 0,
            details.statsSource,
            vid,
          ]
        );
        await tx.execute(
          `INSERT INTO video_snapshots (
             video_id, user_id, is_baseline, original_title, original_description,
             view_count, like_count, comment_count, subscriber_count, subscribers_hidden, source
           ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            vid,
            Number(video.user_id),
            details.title,
            details.description,
            details.viewCount,
            details.likeCount,
            details.commentCount,
            details.subscriberCount,
            details.subscribersHidden ? 1 : 0,
            details.statsSource,
          ]
        );
      });
      await writeAuditLog(req.user!.id, req.user!.email, 'admin_video_snapshot', 'video', vid, {}, req.ip || '');
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Snapshot capture failed.' });
    }
  })
);

app.get(
  '/api/admin/campaigns',
  requireAuth,
  requireAdmin('campaigns:manage'),
  asyncHandler(async (_req, res) => {
    const campaigns = await db.queryAll(
      `SELECT c.*, u.email AS customer_email, v.title AS video_title, v.url AS video_url, v.channel_url, v.channel_name, v.thumbnail_url, p.name AS package_name
       FROM campaigns c
       JOIN users u ON u.id = c.user_id
       JOIN videos v ON v.id = c.video_id
       LEFT JOIN packages p ON p.id = c.package_id
       ORDER BY c.created_at DESC`
    );
    res.json({ campaigns });
  })
);

app.patch(
  '/api/admin/campaigns/:id',
  requireAuth,
  requireAdmin('campaigns:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const cid = Number(req.params.id);
    const { status, startDate, endDate, note } = req.body || {};
    const validStatuses = new Set([
      'awaiting_payment',
      'under_review',
      'approved',
      'scheduled',
      'in_progress',
      'completed',
      'rejected',
      'cancelled',
    ]);
    if (!validStatuses.has(status)) {
      return res.status(400).json({ error: 'Invalid campaign status.' });
    }
    const existing = await db.queryOne<Record<string, any>>(`SELECT * FROM campaigns WHERE id = ?`, [cid]);
    if (!existing) return res.status(404).json({ error: 'Campaign not found.' });

    const nextStart =
      startDate || (status === 'in_progress' && !existing.start_date ? new Date().toISOString() : existing.start_date);
    const nextEnd =
      endDate ||
      (status === 'in_progress' && !existing.end_date
        ? new Date(Date.now() + Number(existing.duration_days) * 86_400_000).toISOString()
        : existing.end_date);

    await db.transaction(async (tx) => {
      await tx.execute(
        `UPDATE campaigns SET status = ?, start_date = ?, end_date = ?, updated_at = ${sqlNow()} WHERE id = ?`,
        [status, nextStart, nextEnd, cid]
      );

      await tx.execute(
        `INSERT INTO campaign_activities (campaign_id, actor_type, actor_id, activity_type, summary, details)
         VALUES (?, 'admin', ?, 'status_changed', ?, ?)`,
        [cid, req.user!.id, `Campaign marked ${status.replace('_', ' ')}`, String(note || '').trim()]
      );

      await tx.execute(
        `INSERT INTO notifications (user_id, title, message, category, link_path)
         VALUES (?, 'Campaign Status Updated', ?, 'campaign', '/campaigns')`,
        [Number(existing.user_id), `Your campaign ${existing.campaign_ref} is now ${status.replace('_', ' ')}.`]
      );
    });

    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'campaign_status_updated',
      'campaign',
      cid,
      { status, note },
      req.ip || ''
    );
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/campaigns/:id/activities',
  requireAuth,
  requireAdmin('tasks:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const cid = Number(req.params.id);
    const { activityType, summary, details } = req.body || {};
    if (!String(summary || '').trim()) {
      return res.status(400).json({ error: 'Activity summary is required.' });
    }
    await db.execute(
      `INSERT INTO campaign_activities (campaign_id, actor_type, actor_id, activity_type, summary, details)
       VALUES (?, 'admin', ?, ?, ?, ?)`,
      [cid, req.user!.id, String(activityType || 'promotion_task'), String(summary).trim(), String(details || '').trim()]
    );

    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'promotion_task_logged',
      'campaign',
      cid,
      { summary },
      req.ip || ''
    );
    res.status(201).json({ ok: true });
  })
);

app.post(
  '/api/admin/campaigns/:id/report',
  requireAuth,
  requireAdmin('reports:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const cid = Number(req.params.id);
    const campaign = await db.queryOne<Record<string, any>>(`SELECT * FROM campaigns WHERE id = ?`, [cid]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

    const [baselineRaw, latestRaw] = await Promise.all([
      db.queryOne<Record<string, any>>(
        `SELECT * FROM video_snapshots WHERE video_id = ? AND is_baseline = 1 LIMIT 1`,
        [Number(campaign.video_id)]
      ),
      db.queryOne<Record<string, any>>(
        `SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1`,
        [Number(campaign.video_id)]
      ),
    ]);

    const baseline = normalizeSnapshotRow(baselineRaw);
    const latest = normalizeSnapshotRow(latestRaw);

    const viewsDelta =
      baseline && latest && baseline.view_count !== null && latest.view_count !== null
        ? latest.view_count - baseline.view_count
        : null;
    const likesDelta =
      baseline && latest && baseline.like_count !== null && latest.like_count !== null
        ? latest.like_count - baseline.like_count
        : null;
    const subsDelta =
      baseline && latest && baseline.subscriber_count !== null && latest.subscriber_count !== null
        ? latest.subscriber_count - baseline.subscriber_count
        : null;

    const summary = String(
      req.body?.summary ||
        `Completion report generated for ${campaign.campaign_ref}. All legitimate audience discovery deliverables logged.`
    ).trim();
    const deliverablesCompleted = Array.isArray(req.body?.deliverablesCompleted)
      ? req.body.deliverablesCompleted
      : JSON.parse(campaign.deliverables_json || '[]');

    await db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO campaign_reports (
           campaign_id, summary, measured_views_delta, measured_likes_delta, measured_subs_delta,
           attribution_note, deliverables_completed_json, generated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cid,
          summary,
          viewsDelta,
          likesDelta,
          subsDelta,
          'Measured public YouTube metrics reflect combined organic, browse, search, and promotional exposure; Vantage Reach does not claim sole attribution for total channel growth.',
          JSON.stringify(deliverablesCompleted),
          req.user!.id,
        ]
      );

      await tx.execute(
        `INSERT INTO notifications (user_id, title, message, category, link_path)
         VALUES (?, 'Campaign Completion Report Ready', ?, 'report', '/campaigns')`,
        [Number(campaign.user_id), `Completion report for campaign ${campaign.campaign_ref} is now available.`]
      );
    });

    await writeAuditLog(req.user!.id, req.user!.email, 'campaign_report_published', 'campaign', cid, {}, req.ip || '');
    res.status(201).json({ ok: true });
  })
);

app.get(
  '/api/admin/tasks',
  requireAuth,
  requireAdmin('tasks:manage'),
  asyncHandler(async (_req, res) => {
    const tasks = await db.queryAll(
      `SELECT ca.*, c.campaign_ref, c.title AS campaign_title, c.status AS campaign_status
       FROM campaign_activities ca
       JOIN campaigns c ON c.id = ca.campaign_id
       ORDER BY ca.created_at DESC LIMIT 80`
    );
    res.json({ tasks });
  })
);

app.get(
  '/api/admin/seo-orders',
  requireAuth,
  requireAdmin('seo_orders:manage'),
  asyncHandler(async (_req, res) => {
    const orders = await db.queryAll(
      `SELECT o.*, u.email AS customer_email, v.title AS video_title
       FROM seo_orders o
       JOIN users u ON u.id = o.user_id
       JOIN videos v ON v.id = o.video_id
       ORDER BY o.created_at DESC`
    );
    res.json({ orders });
  })
);

app.patch(
  '/api/admin/seo-orders/:id',
  requireAuth,
  requireAdmin('seo_orders:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const oid = Number(req.params.id);
    const { orderStatus, notes } = req.body || {};
    const valid = new Set(['awaiting_payment', 'queued', 'in_progress', 'delivered', 'cancelled']);
    if (!valid.has(orderStatus)) return res.status(400).json({ error: 'Invalid order status.' });

    const order = await db.queryOne<Record<string, any>>(`SELECT * FROM seo_orders WHERE id = ?`, [oid]);
    if (!order) return res.status(404).json({ error: 'SEO order not found.' });

    await db.execute(`UPDATE seo_orders SET order_status = ?, notes = ?, updated_at = ${sqlNow()} WHERE id = ?`, [
      orderStatus,
      String(notes ?? order.notes),
      oid,
    ]);
    await db.execute(
      `INSERT INTO notifications (user_id, title, message, category, link_path)
       VALUES (?, 'SEO Service Order Updated', ?, 'seo', '/seo')`,
      [Number(order.user_id), `Your SEO order ${order.order_ref} is now ${orderStatus.replace('_', ' ')}.`]
    );
    await writeAuditLog(req.user!.id, req.user!.email, 'seo_order_updated', 'seo_order', oid, { orderStatus }, req.ip || '');
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/payments',
  requireAuth,
  requireAdmin('payments:manage'),
  asyncHandler(async (_req, res) => {
    const payments = await db.queryAll(
      `SELECT p.*, u.email AS customer_email, c.campaign_ref, o.order_ref
       FROM payments p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN campaigns c ON c.id = p.campaign_id
       LEFT JOIN seo_orders o ON o.id = p.seo_order_id
       ORDER BY p.created_at DESC`
    );
    res.json({ payments });
  })
);

app.post(
  '/api/admin/payments/:id/refund',
  requireAuth,
  requireAdmin('payments:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pid = Number(req.params.id);
    const reason = String(req.body?.reason || 'Refund approved by Vantage Reach administrator').trim();
    const payment = await db.queryOne<Record<string, any>>(`SELECT * FROM payments WHERE id = ?`, [pid]);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status !== 'verified') {
      return res.status(400).json({ error: 'Only verified payments can be refunded.' });
    }

    await db.transaction(async (tx) => {
      const nowExpr = sqlNow();
      await tx.execute(
        `UPDATE payments SET status = 'refunded', refunded_at = ${nowExpr}, refund_reason = ?, updated_at = ${nowExpr} WHERE id = ?`,
        [reason, pid]
      );
      if (payment.campaign_id) {
        await tx.execute(
          `UPDATE campaigns SET payment_status = 'refunded', status = 'cancelled', updated_at = ${nowExpr} WHERE id = ?`,
          [Number(payment.campaign_id)]
        );
      }
      if (payment.seo_order_id) {
        await tx.execute(
          `UPDATE seo_orders SET payment_status = 'refunded', order_status = 'cancelled', updated_at = ${nowExpr} WHERE id = ?`,
          [Number(payment.seo_order_id)]
        );
      }
      await tx.execute(
        `INSERT INTO notifications (user_id, title, message, category, link_path)
         VALUES (?, 'Payment Refunded', ?, 'billing', '/profile')`,
        [Number(payment.user_id), `Payment ${payment.tx_ref} was refunded. Reason: ${reason}`]
      );
    });

    await writeAuditLog(req.user!.id, req.user!.email, 'payment_refunded', 'payment', pid, { reason }, req.ip || '');
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/reports',
  requireAuth,
  requireAdmin('reports:read'),
  asyncHandler(async (_req, res) => {
    const reports = await db.queryAll<Record<string, any>>(
      `SELECT r.*, c.campaign_ref, c.title AS campaign_title, u.email AS customer_email
       FROM campaign_reports r
       JOIN campaigns c ON c.id = r.campaign_id
       JOIN users u ON u.id = c.user_id
       ORDER BY r.created_at DESC`
    );
    res.json({
      reports: reports.map((r) => ({
        ...r,
        id: Number(r.id),
        measured_views_delta: toNullableNum(r.measured_views_delta),
        measured_likes_delta: toNullableNum(r.measured_likes_delta),
        measured_subs_delta: toNullableNum(r.measured_subs_delta),
      })),
    });
  })
);

app.get(
  '/api/admin/packages',
  requireAuth,
  requireAdmin('pricing:manage'),
  asyncHandler(async (_req, res) => {
    const rows = await db.queryAll<Record<string, any>>(`SELECT * FROM packages ORDER BY sort_order ASC, id ASC`);
    res.json({
      packages: rows.map((r) => ({
        ...r,
        id: Number(r.id),
        duration_days: Number(r.duration_days || 0),
        price_usd: Number(r.price_usd || 0),
        price_ngn: Number(r.price_ngn || 0),
        is_active: Number(r.is_active || 0),
        deliverables: JSON.parse(r.deliverables_json || '[]'),
      })),
    });
  })
);

app.post(
  '/api/admin/packages',
  requireAuth,
  requireAdmin('pricing:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { code, kind, name, description, durationDays, priceUsd, priceNgn, deliverables, isActive } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Package name is required.' });
    const cleanKind = kind === 'seo_service' ? 'seo_service' : 'promotion';
    const rawCode = String(code || cleanName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    const finalCode = rawCode || `pkg_${Date.now().toString(36)}`;
    const existing = await db.queryOne<{ id: number }>(`SELECT id FROM packages WHERE code = ?`, [finalCode]);
    if (existing) {
      return res.status(409).json({ error: `A package with code "${finalCode}" already exists.` });
    }
    const pkgId = await db.insert(
      `INSERT INTO packages (code, kind, name, description, duration_days, price_usd, price_ngn, deliverables_json, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalCode,
        cleanKind,
        cleanName,
        String(description || '').trim(),
        Math.max(0, Number(durationDays || 0)),
        Math.max(0, Number(priceUsd || 0)),
        Math.max(0, Number(priceNgn || 0)),
        JSON.stringify(Array.isArray(deliverables) ? deliverables.map((d) => String(d).trim()).filter(Boolean) : []),
        isActive === false ? 0 : 1,
        cleanKind === 'promotion' ? 5 : 20,
      ]
    );
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'package_created',
      'package',
      pkgId,
      { code: finalCode, name: cleanName },
      req.ip || ''
    );
    res.status(201).json({ ok: true, id: pkgId });
  })
);

app.put(
  '/api/admin/packages/:id',
  requireAuth,
  requireAdmin('pricing:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pkgId = Number(req.params.id);
    const { name, description, durationDays, priceUsd, priceNgn, deliverables, isActive } = req.body || {};
    await db.execute(
      `UPDATE packages
       SET name = ?, description = ?, duration_days = ?, price_usd = ?, price_ngn = ?,
           deliverables_json = ?, is_active = ?, updated_at = ${sqlNow()}
       WHERE id = ?`,
      [
        String(name || '').trim(),
        String(description || '').trim(),
        Number(durationDays || 0),
        Number(priceUsd || 0),
        Number(priceNgn || 0),
        JSON.stringify(Array.isArray(deliverables) ? deliverables : []),
        isActive ? 1 : 0,
        pkgId,
      ]
    );
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'package_pricing_updated',
      'package',
      pkgId,
      { priceUsd, priceNgn, isActive },
      req.ip || ''
    );
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/notifications',
  requireAuth,
  requireAdmin('notifications:manage'),
  asyncHandler(async (_req, res) => {
    const [recent, customers] = await Promise.all([
      db.queryAll(
        `SELECT n.id, n.title, n.message, n.category, n.link_path, n.created_at, u.email AS recipient_email
         FROM notifications n
         JOIN users u ON u.id = n.user_id
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT 35`
      ),
      db.queryAll(
        `SELECT u.id, u.email, COALESCE(p.full_name, '') AS full_name
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.status = 'active'
         ORDER BY u.id DESC
         LIMIT 200`
      ),
    ]);
    res.json({ recent, customers });
  })
);

app.post(
  '/api/admin/notifications/broadcast',
  requireAuth,
  requireAdmin('notifications:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { title, message, targetUserId, linkPath } = req.body || {};
    if (!String(title || '').trim() || !String(message || '').trim()) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }
    const cleanTitle = String(title).trim();
    const cleanMsg = String(message).trim();
    const cleanLink = String(linkPath || '/').trim() || '/';
    const insSql = `INSERT INTO notifications (user_id, title, message, category, link_path) VALUES (?, ?, ?, 'announcement', ?)`;

    let sentCount = 0;
    if (targetUserId) {
      await db.execute(insSql, [Number(targetUserId), cleanTitle, cleanMsg, cleanLink]);
      sentCount = 1;
    } else {
      const users = await db.queryAll<{ id: number }>(`SELECT id FROM users WHERE status = 'active'`);
      await db.transaction(async (tx) => {
        for (const u of users) {
          await tx.execute(insSql, [Number(u.id), cleanTitle, cleanMsg, cleanLink]);
          sentCount++;
        }
      });
    }
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'notification_broadcast',
      'notification',
      targetUserId || 'all',
      { title: cleanTitle, sentCount },
      req.ip || ''
    );
    res.json({ ok: true, sentCount });
  })
);

app.put(
  '/api/admin/site-config',
  requireAuth,
  requireAdmin('settings:site'),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = req.body || {};
    const textVal = (val: unknown, fallback: string, maxLen: number) => {
      const s = String(val ?? '').trim();
      return (s || fallback).slice(0, maxLen);
    };
    const optionalTextVal = (val: unknown, maxLen: number) => String(val ?? '').trim().slice(0, maxLen);

    let logoUrl = '';
    let iconUrl = '';
    let splashImageUrl = '';
    try {
      logoUrl = sanitizeSiteMediaUrl(body.logoUrl, 'Site Logo');
      iconUrl = sanitizeSiteMediaUrl(body.iconUrl, 'App Icon');
      splashImageUrl = sanitizeSiteMediaUrl(body.splashImageUrl, 'Splash Image');
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Invalid branding image URL.' });
    }

    const appName = textVal(body.appName, DEFAULT_SITE_CONFIG.appName, 80);
    const shortName = textVal(body.shortName, appName.slice(0, 12), 20);
    const durationNum = Number(body.splashDurationMs ?? DEFAULT_SITE_CONFIG.splashDurationMs);
    const splashDurationMs = Number.isFinite(durationNum) ? Math.min(4000, Math.max(0, Math.round(durationNum))) : 900;

    const pairs: Array<[string, string]> = [
      ['site_app_name', appName],
      ['site_short_name', shortName],
      ['company_name', textVal(body.companyName, DEFAULT_SITE_CONFIG.companyName, 120)],
      ['site_tagline', textVal(body.tagline, DEFAULT_SITE_CONFIG.tagline, 120)],
      ['site_hero_headline', textVal(body.heroHeadline, DEFAULT_SITE_CONFIG.heroHeadline, 180)],
      ['site_hero_description', textVal(body.heroDescription, DEFAULT_SITE_CONFIG.heroDescription, 600)],
      ['site_meta_description', textVal(body.metaDescription, DEFAULT_SITE_CONFIG.metaDescription, 400)],
      ['site_footer_text', textVal(body.footerText, DEFAULT_SITE_CONFIG.footerText, 160)],
      ['support_email', textVal(body.supportEmail, DEFAULT_SITE_CONFIG.supportEmail, 120)],
      ['site_logo_url', logoUrl],
      ['site_icon_url', iconUrl],
      ['site_theme_color', sanitizeHexColor(body.themeColor, DEFAULT_SITE_CONFIG.themeColor)],
      ['site_splash_enabled', body.splashEnabled === false ? '0' : '1'],
      ['site_splash_title', textVal(body.splashTitle, appName, 80)],
      ['site_splash_subtitle', textVal(body.splashSubtitle, DEFAULT_SITE_CONFIG.splashSubtitle, 140)],
      ['site_splash_bg_color', sanitizeHexColor(body.splashBgColor, DEFAULT_SITE_CONFIG.splashBgColor)],
      ['site_splash_text_color', sanitizeHexColor(body.splashTextColor, DEFAULT_SITE_CONFIG.splashTextColor)],
      ['site_splash_accent_color', sanitizeHexColor(body.splashAccentColor, DEFAULT_SITE_CONFIG.splashAccentColor)],
      ['site_splash_duration_ms', String(splashDurationMs)],
      ['site_splash_image_url', splashImageUrl],
      ['site_welcome_notif_title', textVal(body.welcomeNotifTitle, DEFAULT_SITE_CONFIG.welcomeNotifTitle, 120)],
      ['site_welcome_notif_message', textVal(body.welcomeNotifMessage, DEFAULT_SITE_CONFIG.welcomeNotifMessage, 600)],
      ['site_announcement_banner', optionalTextVal(body.announcementBanner, 240)],
      ['site_registrations_open', body.registrationsOpen === false ? '0' : '1'],
    ];

    const nowExpr = sqlNow();
    await db.transaction(async (tx) => {
      for (const [k, v] of pairs) {
        await tx.execute(
          `INSERT INTO system_settings (key, value, is_secret, description, updated_by, updated_at)
           VALUES (?, ?, 0, ?, ?, ${nowExpr})
           ON CONFLICT (key) DO UPDATE
           SET value = excluded.value, updated_by = excluded.updated_by, updated_at = ${nowExpr}`,
          [k, v, k, req.user!.id]
        );
      }
    });

    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'site_branding_updated',
      'system_setting',
      'site_config',
      { appName, shortName, splashEnabled: body.splashEnabled !== false },
      req.ip || ''
    );
    const config = await getPublicSiteConfig();
    res.json({ ok: true, config });
  })
);

app.put(
  '/api/admin/owner-account',
  requireAuth,
  requireAdmin(),
  asyncHandler(async (req: AuthRequest, res) => {
    if (req.user!.adminRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super administrator / site owner can update owner credentials.' });
    }
    const { email, fullName, currentPassword, newPassword } = req.body || {};
    const cleanEmail = String(email || req.user!.email).trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid owner email address.' });
    }
    const cleanName = String(fullName ?? req.user!.fullName ?? '').trim().slice(0, 120);
    const row = await db.queryOne<{ id: number; email: string; password_hash: string }>(
      `SELECT id, email, password_hash FROM users WHERE id = ?`,
      [req.user!.id]
    );
    if (!row) return res.status(404).json({ error: 'Owner account not found.' });

    const changingSensitive = cleanEmail !== row.email || Boolean(newPassword);
    if (changingSensitive) {
      if (!currentPassword || !verifyPasswordSync(String(currentPassword), row.password_hash)) {
        return res.status(400).json({ error: 'Current password is required to change your owner email or password.' });
      }
    }
    if (newPassword && (typeof newPassword !== 'string' || newPassword.length < 8)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }
    if (cleanEmail !== row.email) {
      const taken = await db.queryOne<{ id: number }>(`SELECT id FROM users WHERE email = ? AND id != ?`, [
        cleanEmail,
        req.user!.id,
      ]);
      if (taken) {
        return res.status(409).json({ error: 'Another user account already uses that email address.' });
      }
    }

    const nowExpr = sqlNow();
    await db.transaction(async (tx) => {
      if (newPassword) {
        await tx.execute(`UPDATE users SET email = ?, password_hash = ?, updated_at = ${nowExpr} WHERE id = ?`, [
          cleanEmail,
          hashPasswordSync(newPassword),
          req.user!.id,
        ]);
      } else {
        await tx.execute(`UPDATE users SET email = ?, updated_at = ${nowExpr} WHERE id = ?`, [cleanEmail, req.user!.id]);
      }
      await tx.execute(`UPDATE user_profiles SET full_name = ?, updated_at = ${nowExpr} WHERE user_id = ?`, [
        cleanName,
        req.user!.id,
      ]);
    });

    const token = signSessionToken(req.user!.id, cleanEmail);
    setSessionCookie(res, token, req);
    await writeAuditLog(
      req.user!.id,
      cleanEmail,
      'owner_account_updated',
      'user',
      req.user!.id,
      { emailChanged: cleanEmail !== row.email, passwordChanged: Boolean(newPassword) },
      req.ip || ''
    );
    res.json({
      ok: true,
      sessionToken: token,
      user: {
        ...req.user!,
        email: cleanEmail,
        fullName: cleanName,
      },
    });
  })
);

app.get(
  '/api/admin/settings',
  requireAuth,
  requireAdmin('overview:read'),
  asyncHandler(async (_req, res) => {
    const rows = await db.queryAll<{
      key: string;
      value: string;
      is_secret: number;
      description: string;
      updated_at: string;
    }>(`SELECT key, value, is_secret, description, updated_at FROM system_settings ORDER BY key ASC`);
    const sanitized = rows.map((r) => ({
      ...r,
      is_secret: Number(r.is_secret || 0),
      value: r.is_secret && r.value ? '••••••••' + r.value.slice(-4) : r.value,
      hasValue: Boolean(r.value),
    }));
    res.json({ settings: sanitized });
  })
);

app.put(
  '/api/admin/settings',
  requireAuth,
  (req: AuthRequest, res, next) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin required.' });
    const key = String(req.body?.key || '').trim();
    if (key.startsWith('gemini_') && req.user.adminRole !== 'super_admin' && !req.user.permissions.includes('settings:gemini')) {
      return res.status(403).json({ error: 'Missing settings:gemini permission.' });
    }
    if (key.startsWith('youtube_') && req.user.adminRole !== 'super_admin' && !req.user.permissions.includes('settings:youtube')) {
      return res.status(403).json({ error: 'Missing settings:youtube permission.' });
    }
    if (
      (key.startsWith('flutterwave_') || key.startsWith('payment_')) &&
      req.user.adminRole !== 'super_admin' &&
      !req.user.permissions.includes('payments:manage') &&
      !req.user.permissions.includes('settings:youtube')
    ) {
      return res.status(403).json({ error: 'Missing payments:manage or settings:youtube permission.' });
    }
    if (
      (key.startsWith('site_') || key === 'company_name' || key === 'support_email') &&
      req.user.adminRole !== 'super_admin' &&
      !req.user.permissions.includes('settings:site')
    ) {
      return res.status(403).json({ error: 'Missing settings:site permission.' });
    }
    next();
  },
  asyncHandler(async (req: AuthRequest, res) => {
    const { key, value } = req.body || {};
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return res.status(400).json({ error: 'Setting key is required.' });
    const existing = await db.queryOne<{ is_secret: number }>(
      `SELECT is_secret FROM system_settings WHERE key = ?`,
      [cleanKey]
    );
    if (!existing) return res.status(404).json({ error: 'Setting key not found.' });
    if (existing.is_secret && String(value || '').startsWith('••••')) {
      return res.json({ ok: true, unchanged: true });
    }

    await db.execute(
      `UPDATE system_settings SET value = ?, updated_by = ?, updated_at = ${sqlNow()} WHERE key = ?`,
      [String(value ?? '').trim(), req.user!.id, cleanKey]
    );
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'system_setting_updated',
      'system_setting',
      cleanKey,
      { masked: Boolean(existing.is_secret) },
      req.ip || ''
    );
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/payment-gateways',
  requireAuth,
  requireAdmin(),
  asyncHandler(async (_req, res) => {
    const status = await getPaymentGatewayStatus();
    res.json({ status });
  })
);

app.post(
  '/api/admin/flutterwave/test',
  requireAuth,
  requireAdmin(),
  asyncHandler(async (req: AuthRequest, res) => {
    if (
      req.user!.adminRole !== 'super_admin' &&
      !req.user!.permissions.includes('payments:manage') &&
      !req.user!.permissions.includes('settings:youtube')
    ) {
      return res.status(403).json({ error: 'Administrator payment permission required.' });
    }
    const flw = await getFlutterwaveCredentials();
    if (!flw.secretKey) {
      return res.status(400).json({
        error: 'Flutterwave Secret Key is not saved yet. Enter your FLWSECK key and save first.',
      });
    }
    const flwRes = await fetch('https://api.flutterwave.com/v3/balances', {
      headers: { Authorization: `Bearer ${flw.secretKey}` },
    });
    const flwJson = (await flwRes.json().catch(() => ({}))) as { status?: string; message?: string };
    if (!flwRes.ok || flwJson.status !== 'success') {
      return res.status(400).json({
        error: flwJson.message || 'Flutterwave rejected the secret key. Check that it is valid and active.',
      });
    }
    res.json({
      ok: true,
      connected: true,
      mode: flw.secretKey.includes('_TEST-') ? 'test' : 'live',
      message: flw.secretKey.includes('_TEST-')
        ? 'Connected to Flutterwave (Test Mode).'
        : 'Connected to Flutterwave (Live Payments Active).',
    });
  })
);

app.get(
  '/api/admin/staff',
  requireAuth,
  requireAdmin('staff:manage'),
  asyncHandler(async (_req, res) => {
    const staff = await db.queryAll(
      `SELECT a.id, a.user_id, a.staff_title, a.is_active, a.created_at,
              u.email, COALESCE(p.full_name, '') AS full_name,
              r.id AS role_id, r.name AS role_name
       FROM admin_users a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       JOIN roles r ON r.id = a.role_id
       ORDER BY a.created_at DESC`
    );
    res.json({ staff });
  })
);

app.post(
  '/api/admin/staff',
  requireAuth,
  requireAdmin('staff:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { email, fullName, password, roleId, staffTitle } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !roleId) {
      return res.status(400).json({ error: 'Email and role are required.' });
    }

    let userRow = await db.queryOne<{ id: number }>(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
    try {
      await db.transaction(async (tx) => {
        if (!userRow) {
          if (typeof password !== 'string' || password.length < 8) {
            throw new Error('Password (min 8 chars) is required when creating a new staff user.');
          }
          const uid = await tx.insert(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, [
            cleanEmail,
            hashPasswordSync(password),
          ]);
          userRow = { id: uid };
          await tx.execute(`INSERT INTO user_profiles (user_id, full_name, country) VALUES (?, ?, 'Global')`, [
            uid,
            String(fullName || cleanEmail.split('@')[0]).trim(),
          ]);
        }
        await tx.execute(
          `INSERT INTO admin_users (user_id, role_id, staff_title, is_active)
           VALUES (?, ?, ?, 1)
           ON CONFLICT (user_id) DO UPDATE SET role_id = excluded.role_id, staff_title = excluded.staff_title, is_active = 1, updated_at = ${sqlNow()}`,
          [Number(userRow.id), Number(roleId), String(staffTitle || 'Operations Specialist').trim()]
        );
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    await writeAuditLog(req.user!.id, req.user!.email, 'staff_account_saved', 'admin_user', cleanEmail, { roleId }, req.ip || '');
    res.status(201).json({ ok: true });
  })
);

app.patch(
  '/api/admin/staff/:id',
  requireAuth,
  requireAdmin('staff:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const aid = Number(req.params.id);
    const { roleId, staffTitle, isActive } = req.body || {};
    await db.execute(
      `UPDATE admin_users SET role_id = COALESCE(?, role_id), staff_title = COALESCE(?, staff_title), is_active = ?, updated_at = ${sqlNow()} WHERE id = ?`,
      [roleId ? Number(roleId) : null, staffTitle ? String(staffTitle) : null, isActive ? 1 : 0, aid]
    );
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'staff_account_updated',
      'admin_user',
      aid,
      { roleId, isActive },
      req.ip || ''
    );
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/roles',
  requireAuth,
  requireAdmin('roles:manage'),
  asyncHandler(async (_req, res) => {
    const roles = await db.queryAll<Record<string, any>>(`SELECT * FROM roles ORDER BY id ASC`);
    res.json({
      roles: roles.map((r) => ({ ...r, id: Number(r.id), permissions: JSON.parse(r.permissions_json || '[]') })),
    });
  })
);

app.put(
  '/api/admin/roles/:id',
  requireAuth,
  requireAdmin('roles:manage'),
  asyncHandler(async (req: AuthRequest, res) => {
    const rid = Number(req.params.id);
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    await db.execute(`UPDATE roles SET permissions_json = ? WHERE id = ?`, [JSON.stringify(permissions), rid]);
    await writeAuditLog(
      req.user!.id,
      req.user!.email,
      'role_permissions_updated',
      'role',
      rid,
      { permissions },
      req.ip || ''
    );
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/audit-logs',
  requireAuth,
  requireAdmin('audit:read'),
  asyncHandler(async (_req, res) => {
    const logs = await db.queryAll(`SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 120`);
    res.json({ logs });
  })
);

app.get(
  '/api/admin/visitors',
  requireAuth,
  requireAdmin('visitors:read'),
  asyncHandler(async (req, res) => {
    const data = await getAdminVisitorAnalytics({
      window: String(req.query.window || '24h'),
      device: String(req.query.device || 'all'),
      authFilter: String(req.query.authFilter || 'all'),
      search: String(req.query.search || ''),
    });
    res.json(data);
  })
);

app.get(
  '/api/admin/visitors/:sessionId',
  requireAuth,
  requireAdmin('visitors:read'),
  asyncHandler(async (req, res) => {
    const detail = await getAdminVisitorSessionDetail(String(req.params.sessionId || ''));
    if (!detail) {
      return res.status(404).json({ error: 'Visitor session not found.' });
    }
    res.json(detail);
  })
);

function escapeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

app.get(
  '/api/admin/visitors-export',
  requireAuth,
  requireAdmin('visitors:read'),
  asyncHandler(async (req, res) => {
    const data = await getAdminVisitorAnalytics({
      window: String(req.query.window || '24h'),
      device: String(req.query.device || 'all'),
      authFilter: String(req.query.authFilter || 'all'),
      search: String(req.query.search || ''),
    });
    const header = [
      'session_id',
      'visitor_id',
      'status',
      'user_email',
      'ip_address',
      'country',
      'region',
      'city',
      'isp',
      'timezone',
      'language',
      'device_type',
      'device_vendor',
      'os_name',
      'browser_name',
      'screen_resolution',
      'viewport_size',
      'network_type',
      'is_pwa',
      'entry_path',
      'current_path',
      'page_views',
      'referrer',
      'utm_source',
      'first_seen_at',
      'last_seen_at',
    ].join(',');

    const lines = data.visitors.map((v) =>
      [
        v.session_id,
        v.visitor_id,
        v.is_online ? 'online' : 'offline',
        v.user_email || 'Guest',
        v.ip_address,
        v.country,
        v.region,
        v.city,
        v.isp,
        v.timezone,
        v.language,
        v.device_type,
        v.device_vendor,
        v.os_name,
        v.browser_name,
        v.screen_resolution,
        v.viewport_size,
        v.network_type,
        v.is_pwa ? 'PWA' : 'Web',
        v.entry_path,
        v.current_path,
        v.page_views,
        v.referrer,
        v.utm_source,
        v.first_seen_at,
        v.last_seen_at,
      ]
        .map(escapeCsvCell)
        .join(',')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vantage-reach-visitors.csv"');
    res.send([header, ...lines].join('\n'));
  })
);

// ==================== GLOBAL API ERROR HANDLER ====================

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server route error:', err?.message || err);
  if (!res.headersSent) {
    res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
  }
});

// ==================== VITE / STATIC SERVING (NON-VERCEL) ====================

function applyPwaNoCacheHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
  const p = req.path;
  if (
    p === '/' ||
    p === '/index.html' ||
    p === '/sw.js' ||
    p === '/dev-sw.js' ||
    p === '/registerSW.js' ||
    p === '/manifest.webmanifest' ||
    /^\/workbox-.*\.js$/.test(p)
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
}

async function startServer() {
  await initDatabase();

  app.use(applyPwaNoCacheHeaders);

  app.get(
    '/manifest.webmanifest',
    asyncHandler(async (_req, res) => {
      await sendDynamicManifest(res);
    })
  );

  if (process.env.NODE_ENV !== 'production') {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = (await import(vitePkg)) as typeof import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        etag: true,
        lastModified: true,
        setHeaders(res, filePath) {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest' ||
            /^workbox-.*\.js$/.test(base)
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Vantage Reach server running on http://0.0.0.0:${PORT} (${isPostgresDatabase() ? 'Neon Postgres' : 'SQLite'})`
    );
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

if (!process.env.VERCEL && process.env.VITEST !== 'true') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const SESSION_COOKIE = 'vr_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'vantage-reach-dev-session-secret-change-in-prod';
}

export interface SessionPayload {
  uid: number;
  email: string;
  exp: number;
}

export function signSessionToken(uid: number, email: string): string {
  const payload: SessionPayload = {
    uid,
    email,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

function isHttpsRequest(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === 'production';
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || proto.includes('https') || process.env.NODE_ENV === 'production';
}

export function setSessionCookie(res: Response, token: string, req?: Request) {
  const secure = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    partitioned: secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  } as any);
}

export function clearSessionCookie(res: Response, req?: Request) {
  const secure = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    partitioned: secure,
    path: '/',
  } as any);
}

export interface AuthedUser {
  id: number;
  email: string;
  status: string;
  fullName: string;
  isAdmin: boolean;
  adminRole: string | null;
  permissions: string[];
}

export interface AuthRequest extends Request {
  user?: AuthedUser;
}

export function loadUserById(userId: number): AuthedUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.status, COALESCE(p.full_name, '') AS full_name,
              a.id AS admin_id, a.is_active AS admin_active,
              r.name AS role_name, r.permissions_json
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN admin_users a ON a.user_id = u.id AND a.is_active = 1
       LEFT JOIN roles r ON r.id = a.role_id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: number;
        email: string;
        status: string;
        full_name: string;
        admin_id: number | null;
        admin_active: number | null;
        role_name: string | null;
        permissions_json: string | null;
      }
    | undefined;

  if (!row || row.status !== 'active') return null;

  let permissions: string[] = [];
  if (row.admin_id && row.permissions_json) {
    try {
      permissions = JSON.parse(row.permissions_json);
    } catch {
      permissions = [];
    }
  }

  return {
    id: row.id,
    email: row.email,
    status: row.status,
    fullName: row.full_name,
    isAdmin: Boolean(row.admin_id),
    adminRole: row.role_name,
    permissions,
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const cookies = parseCookies(req);
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = cookies[SESSION_COOKIE] || bearer;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const user = loadUserById(payload.uid);
  if (!user) {
    return res.status(401).json({ error: 'Account unavailable or suspended' });
  }
  req.user = user;
  next();
}

export function requireAdmin(requiredPermission?: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    if (
      requiredPermission &&
      req.user.adminRole !== 'super_admin' &&
      !req.user.permissions.includes(requiredPermission)
    ) {
      return res.status(403).json({ error: `Missing required permission: ${requiredPermission}` });
    }
    next();
  };
}

// Simple sliding-window rate limiter for auth and sensitive routes
const rateBuckets = new Map<string, number[]>();

export function rateLimit(keyPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const entries = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (entries.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }
    entries.push(now);
    rateBuckets.set(key, entries);
    next();
  };
}

export function writeAuditLog(
  actorUserId: number | null,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string | number,
  details: Record<string, unknown> = {},
  ipAddress = ''
) {
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, details_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(actorUserId, actorEmail, action, entityType, String(entityId), JSON.stringify(details), ipAddress);
}

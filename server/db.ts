import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'vantage_reach.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordSync(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      reset_token_hash TEXT,
      reset_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      country TEXT NOT NULL DEFAULT 'United States',
      channel_handle TEXT DEFAULT '',
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_in_app INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      youtube_video_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      channel_id TEXT DEFAULT '',
      channel_name TEXT NOT NULL DEFAULT '',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      duration TEXT DEFAULT '',
      published_at TEXT DEFAULT '',
      latest_views INTEGER,
      latest_likes INTEGER,
      latest_comments INTEGER,
      latest_subscribers INTEGER,
      subscribers_hidden INTEGER NOT NULL DEFAULT 0,
      stats_source TEXT NOT NULL DEFAULT 'youtube_data_api_v3',
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, youtube_video_id)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
      campaign_ref TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
      status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (
        status IN (
          'awaiting_payment',
          'under_review',
          'approved',
          'scheduled',
          'in_progress',
          'completed',
          'rejected',
          'cancelled'
        )
      ),
      purchase_date TEXT NOT NULL DEFAULT (datetime('now')),
      start_date TEXT,
      end_date TEXT,
      target_regions TEXT NOT NULL DEFAULT 'Global',
      deliverables_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS video_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      is_baseline INTEGER NOT NULL DEFAULT 0 CHECK (is_baseline IN (0, 1)),
      original_title TEXT NOT NULL,
      original_description TEXT NOT NULL DEFAULT '',
      view_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      subscriber_count INTEGER,
      subscribers_hidden INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'youtube_data_api_v3',
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS prevent_baseline_update
    BEFORE UPDATE ON video_snapshots
    WHEN OLD.is_baseline = 1
    BEGIN
      SELECT RAISE(ABORT, 'Immutable baseline snapshot cannot be overwritten');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_baseline_delete
    BEFORE DELETE ON video_snapshots
    WHEN OLD.is_baseline = 1
    BEGIN
      SELECT RAISE(ABORT, 'Immutable baseline snapshot cannot be deleted');
    END;

    CREATE TABLE IF NOT EXISTS seo_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_audience TEXT NOT NULL DEFAULT 'Global YouTube viewers',
      search_phrases_json TEXT NOT NULL DEFAULT '[]',
      topic_assessment TEXT NOT NULL DEFAULT '',
      main_keyword TEXT NOT NULL DEFAULT '',
      search_intent TEXT NOT NULL DEFAULT '',
      title_clarity_notes TEXT NOT NULL DEFAULT '',
      description_structure_notes TEXT NOT NULL DEFAULT '',
      thumbnail_suitability_notes TEXT NOT NULL DEFAULT '',
      title_alternatives_json TEXT NOT NULL DEFAULT '[]',
      recommended_description TEXT NOT NULL DEFAULT '',
      hashtags_json TEXT NOT NULL DEFAULT '[]',
      content_recommendations_json TEXT NOT NULL DEFAULT '[]',
      limitations_notes TEXT NOT NULL DEFAULT '',
      model_used TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      data_provenance TEXT NOT NULL DEFAULT 'gemini_ai_analysis',
      saved_by_user INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS competitor_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      search_phrase TEXT NOT NULL,
      competitor_video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      view_count INTEGER,
      published_at TEXT DEFAULT '',
      result_position INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'youtube_data_api_v3',
      retrieved_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS keyword_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seo_analysis_id INTEGER NOT NULL REFERENCES seo_analyses(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      keyword_text TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('main', 'related', 'long_tail')),
      rationale TEXT NOT NULL DEFAULT '',
      is_ai_generated INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('promotion', 'seo_service')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      duration_days INTEGER NOT NULL DEFAULT 0,
      price_usd REAL NOT NULL,
      price_ngn REAL NOT NULL,
      deliverables_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seo_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
      seo_analysis_id INTEGER REFERENCES seo_analyses(id) ON DELETE SET NULL,
      order_ref TEXT NOT NULL UNIQUE,
      service_code TEXT NOT NULL,
      service_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
      order_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (order_status IN ('awaiting_payment', 'queued', 'in_progress', 'delivered', 'cancelled')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'admin', 'customer')),
      actor_id INTEGER,
      activity_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      measured_views_delta INTEGER,
      measured_likes_delta INTEGER,
      measured_subs_delta INTEGER,
      attribution_note TEXT NOT NULL,
      deliverables_completed_json TEXT NOT NULL DEFAULT '[]',
      generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      seo_order_id INTEGER REFERENCES seo_orders(id) ON DELETE SET NULL,
      tx_ref TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL CHECK (provider IN ('paystack', 'flutterwave', 'sandbox')),
      provider_ref TEXT DEFAULT '',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'refunded')),
      verified_server_side INTEGER NOT NULL DEFAULT 0,
      webhook_received INTEGER NOT NULL DEFAULT 0,
      failure_reason TEXT DEFAULT '',
      refunded_at TEXT,
      refund_reason TEXT DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      link_path TEXT DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      staff_title TEXT NOT NULL DEFAULT 'Administrator',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_secret INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS visitor_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT 'Unknown',
      region TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      isp TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT '',
      device_type TEXT NOT NULL DEFAULT 'Desktop',
      os_name TEXT NOT NULL DEFAULT 'Unknown',
      browser_name TEXT NOT NULL DEFAULT 'Unknown',
      device_vendor TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      screen_resolution TEXT NOT NULL DEFAULT '',
      viewport_size TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      network_type TEXT NOT NULL DEFAULT '',
      is_pwa INTEGER NOT NULL DEFAULT 0,
      referrer TEXT NOT NULL DEFAULT '',
      utm_source TEXT NOT NULL DEFAULT '',
      utm_medium TEXT NOT NULL DEFAULT '',
      utm_campaign TEXT NOT NULL DEFAULT '',
      entry_path TEXT NOT NULL DEFAULT '/',
      current_path TEXT NOT NULL DEFAULT '/',
      page_views INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS visitor_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES visitor_sessions(session_id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL DEFAULT 'page_view',
      page_path TEXT NOT NULL DEFAULT '/',
      page_title TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_video_id ON video_snapshots(video_id);
    CREATE INDEX IF NOT EXISTS idx_seo_analyses_video_id ON seo_analyses(video_id);
    CREATE INDEX IF NOT EXISTS idx_competitor_video_id ON competitor_results(video_id);
    CREATE INDEX IF NOT EXISTS idx_keywords_analysis_id ON keyword_suggestions(seo_analysis_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_seo_orders_user_id ON seo_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tx_ref ON payments(tx_ref);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_seen ON visitor_sessions(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_id ON visitor_sessions(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_user_id ON visitor_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_visitor_events_session_id ON visitor_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at ON visitor_events(created_at);
  `);

  const seoCols = db.prepare(`PRAGMA table_info(seo_analyses)`).all() as Array<{ name: string }>;
  if (!seoCols.some((c) => c.name === 'structured_assessment_json')) {
    db.exec(`ALTER TABLE seo_analyses ADD COLUMN structured_assessment_json TEXT NOT NULL DEFAULT '{}'`);
  }

  seedInitialData();

  // Ensure super_admin role includes visitors:read permission on existing databases
  const superRoleRow = db
    .prepare(`SELECT id, permissions_json FROM roles WHERE name = 'super_admin'`)
    .get() as { id: number; permissions_json: string } | undefined;
  if (superRoleRow) {
    try {
      const perms = JSON.parse(superRoleRow.permissions_json || '[]') as string[];
      if (!perms.includes('visitors:read')) {
        perms.push('visitors:read');
        db.prepare(`UPDATE roles SET permissions_json = ? WHERE id = ?`).run(
          JSON.stringify(perms),
          superRoleRow.id
        );
      }
    } catch {
      // Ignore parse errors
    }
  }
}

function seedInitialData() {
  // 1. Roles
  const roleStmt = db.prepare(`
    INSERT OR IGNORE INTO roles (name, description, permissions_json)
    VALUES (?, ?, ?)
  `);
  roleStmt.run(
    'super_admin',
    'Full platform, staff, API, pricing, and financial administration',
    JSON.stringify([
      'overview:read',
      'visitors:read',
      'customers:manage',
      'videos:manage',
      'campaigns:manage',
      'tasks:manage',
      'seo_orders:manage',
      'payments:manage',
      'reports:manage',
      'pricing:manage',
      'notifications:manage',
      'settings:gemini',
      'settings:youtube',
      'staff:manage',
      'roles:manage',
      'audit:read',
    ])
  );
  roleStmt.run(
    'campaign_manager',
    'Manages promotion campaigns, tasks, reports, and customer notifications',
    JSON.stringify([
      'overview:read',
      'customers:read',
      'videos:read',
      'campaigns:manage',
      'tasks:manage',
      'reports:manage',
      'notifications:manage',
    ])
  );
  roleStmt.run(
    'seo_specialist',
    'Manages SEO optimization orders and keyword research deliverables',
    JSON.stringify([
      'overview:read',
      'videos:read',
      'seo_orders:manage',
      'reports:read',
    ])
  );
  roleStmt.run(
    'finance_admin',
    'Manages payments, refunds, and service package pricing',
    JSON.stringify([
      'overview:read',
      'payments:manage',
      'pricing:manage',
      'reports:read',
    ])
  );

  // 2. Packages (3 promotion durations + 6 SEO services A-F)
  const pkgStmt = db.prepare(`
    INSERT OR IGNORE INTO packages (code, kind, name, description, duration_days, price_usd, price_ngn, deliverables_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  pkgStmt.run(
    'promo_1d',
    'promotion',
    '1-Day Discovery Boost',
    'Targeted 24-hour audience discovery and creator network spotlight for new uploads.',
    1,
    9.99,
    15500,
    JSON.stringify([
      'Legitimate YouTube audience discovery placement',
      'Niche-matched creator community distribution',
      'Initial baseline & 24h post-campaign snapshot tracking',
      'Campaign activity log & completion summary',
    ]),
    1
  );
  pkgStmt.run(
    'promo_7d',
    'promotion',
    '7-Day Growth Campaign',
    'Sustained week-long legitimate audience discovery, partner placements, and reporting.',
    7,
    24.99,
    38500,
    JSON.stringify([
      'Multi-channel legitimate audience discovery distribution',
      'Editorial & creator partnership feature placement',
      'Daily historical snapshot monitoring',
      'Detailed 7-day performance & attribution disclaimer report',
    ]),
    2
  );
  pkgStmt.run(
    'promo_30d',
    'promotion',
    '30-Day Global Reach Campaign',
    'Full-month international promotion, regional advertising, and ongoing optimization checks.',
    30,
    59.99,
    92000,
    JSON.stringify([
      'International compliant advertising & discovery campaigns',
      'Creator partnership syndication across target territories',
      'Weekly milestone tracking & snapshot comparisons',
      'Executive 30-day downloadable CSV & JSON performance report',
    ]),
    3
  );

  // SEO Services A-F
  pkgStmt.run(
    'seo_basic',
    'seo_service',
    'Basic SEO Analysis',
    'AI-assisted title clarity, topic assessment, and core keyword brief.',
    0,
    0,
    0,
    JSON.stringify([
      'Topic & search intent review',
      'Main keyword + 3 related phrases',
      'Basic title clarity check',
    ]),
    10
  );
  pkgStmt.run(
    'seo_competitor',
    'seo_service',
    'Advanced Competitor Research',
    'Deep-dive multi-phrase competitor benchmark prepared by a Vantage Reach analyst.',
    0,
    14.99,
    23000,
    JSON.stringify([
      'Up to 5 search-phrase competitor benchmarks',
      'Content positioning gap matrix',
      'Actionable differentiation recommendations',
    ]),
    11
  );
  pkgStmt.run(
    'seo_title',
    'seo_service',
    'Title Optimization Service',
    'Human-refined high-clarity YouTube title alternatives tailored for search intent.',
    0,
    9.99,
    15500,
    JSON.stringify([
      '5 curated non-clickbait title options',
      'Keyword placement rationale for each option',
      'Mobile truncation check (under 60 chars)',
    ]),
    12
  );
  pkgStmt.run(
    'seo_description',
    'seo_service',
    'Description Optimization Service',
    'Structured SEO video description with timestamps, context, and compliant hashtags.',
    0,
    12.99,
    20000,
    JSON.stringify([
      'Hook-first 150-character above-the-fold summary',
      'Long-tail keyword integration & chapter outline',
      'Curated relevant hashtag set',
    ]),
    13
  );
  pkgStmt.run(
    'seo_complete',
    'seo_service',
    'Complete YouTube SEO Package',
    'End-to-end specialist optimization covering title, description, tags, and positioning.',
    0,
    34.99,
    54000,
    JSON.stringify([
      'Full title, description & hashtag overhaul',
      'Multi-query competitor positioning report',
      'Long-tail keyword roadmap & content brief',
      '1 revision cycle included',
    ]),
    14
  );
  pkgStmt.run(
    'seo_thumbnail',
    'seo_service',
    'Thumbnail Design Service',
    'Custom high-contrast 1280x720 YouTube thumbnail concepts engineered for mobile legibility.',
    0,
    29.99,
    46000,
    JSON.stringify([
      '2 custom thumbnail design variations',
      'Mobile feed readability & visual hierarchy audit',
      'Source files & ready-to-upload PNGs',
    ]),
    15
  );

  // 3. System Settings
  const settingStmt = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value, is_secret, description)
    VALUES (?, ?, ?, ?)
  `);
  settingStmt.run('gemini_model', 'gemini-4-hydrogen', 0, 'Active Google Gemini model alias for SEO Intelligence');
  settingStmt.run('gemini_max_competitors', '8', 0, 'Maximum competitor videos passed into Gemini prompt context');
  settingStmt.run('youtube_api_key', '', 1, 'Optional override YouTube Data API v3 key (falls back to YOUTUBE_API_KEY env)');
  settingStmt.run('youtube_default_region', 'US', 0, 'Default YouTube Data API v3 regionCode for competitor search');
  settingStmt.run('payment_default_provider', 'paystack', 0, 'Default payment gateway (paystack, flutterwave, or sandbox)');
  settingStmt.run('company_name', 'Vantage Talent Search Global', 0, 'Parent company legal name');
  settingStmt.run('support_email', 'support@vantagereach.global', 0, 'Customer support email');

  // 4. Default Admin User (for testing admin console) & Sample Creator
  const existingAdmin = db.prepare(`SELECT id FROM users WHERE email = ?`).get('admin@vantagereach.global') as { id: number } | undefined;
  if (!existingAdmin) {
    const adminPass = hashPasswordSync('VantageAdmin2026!');
    const res = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?, ?)`).run('admin@vantagereach.global', adminPass);
    const adminUserId = Number(res.lastInsertRowid);
    db.prepare(`INSERT INTO user_profiles (user_id, full_name, country) VALUES (?, ?, ?)`).run(
      adminUserId,
      'Vantage Reach Operations',
      'United Kingdom'
    );
    const superRole = db.prepare(`SELECT id FROM roles WHERE name = 'super_admin'`).get() as { id: number };
    db.prepare(`INSERT INTO admin_users (user_id, role_id, staff_title) VALUES (?, ?, ?)`).run(
      adminUserId,
      superRole.id,
      'Platform Super Administrator'
    );
  }
}

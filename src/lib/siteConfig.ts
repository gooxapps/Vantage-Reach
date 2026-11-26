import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { SiteConfig } from '../types';

const SITE_CONFIG_CACHE_KEY = 'vr_site_config_v1';
const SITE_CONFIG_EVENT = 'vantage:site-config-updated';

export const DEFAULT_SITE_CONFIG: SiteConfig = {
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

export function loadCachedSiteConfig(): SiteConfig {
  try {
    const raw = localStorage.getItem(SITE_CONFIG_CACHE_KEY);
    if (!raw) return DEFAULT_SITE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SiteConfig>;
    return { ...DEFAULT_SITE_CONFIG, ...parsed };
  } catch {
    return DEFAULT_SITE_CONFIG;
  }
}

export function saveCachedSiteConfig(config: SiteConfig): void {
  try {
    localStorage.setItem(SITE_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

function setMetaContent(selector: string, content: string): void {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute('content', content);
}

function setLinkHref(selector: string, href: string): void {
  const el = document.querySelector<HTMLLinkElement>(selector);
  if (el) el.setAttribute('href', href);
}

export function applySiteConfigToDocument(config: SiteConfig): void {
  if (typeof document === 'undefined') return;
  const titleText = config.tagline
    ? `${config.appName} — ${config.tagline}`
    : config.appName;
  document.title = titleText;

  setMetaContent('meta[name="description"]', config.metaDescription);
  setMetaContent('meta[property="og:title"]', titleText);
  setMetaContent('meta[property="og:description"]', config.metaDescription);
  setMetaContent('meta[name="theme-color"]', config.themeColor || '#2563EB');
  setMetaContent('meta[name="apple-mobile-web-app-title"]', config.shortName || config.appName);

  const versionTag = encodeURIComponent(config.updatedAt || '1');
  if (config.iconUrl) {
    setLinkHref('link[rel="apple-touch-icon"]', config.iconUrl);
    setLinkHref('link[rel="icon"][sizes="192x192"]', config.iconUrl);
    setLinkHref('link[rel="shortcut icon"]', config.iconUrl);
    setLinkHref('link[rel="icon"][type="image/svg+xml"]', config.iconUrl);
  } else {
    setLinkHref('link[rel="apple-touch-icon"]', '/apple-touch-icon.png');
    setLinkHref('link[rel="icon"][sizes="192x192"]', '/pwa-192x192.png');
    setLinkHref('link[rel="shortcut icon"]', '/pwa-192x192.png');
    setLinkHref('link[rel="icon"][type="image/svg+xml"]', '/icon.svg');
  }

  let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  manifestLink.href = `/api/manifest.webmanifest?v=${versionTag}`;

  document.documentElement.style.setProperty('--vr-brand-accent', config.themeColor || '#2563EB');
}

export function emitSiteConfigUpdated(config: SiteConfig): void {
  const merged = { ...DEFAULT_SITE_CONFIG, ...config };
  saveCachedSiteConfig(merged);
  applySiteConfigToDocument(merged);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SiteConfig>(SITE_CONFIG_EVENT, { detail: merged }));
  }
}

export function useSiteConfig() {
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(() => loadCachedSiteConfig());

  const refreshSiteConfig = useCallback(async () => {
    try {
      const res = await api.get<{ config: SiteConfig }>('/api/site-config');
      if (res?.config) {
        const merged = { ...DEFAULT_SITE_CONFIG, ...res.config };
        setSiteConfig(merged);
        saveCachedSiteConfig(merged);
        applySiteConfigToDocument(merged);
      }
    } catch {
      // Keep cached or default config offline
    }
  }, []);

  useEffect(() => {
    applySiteConfigToDocument(siteConfig);
    void refreshSiteConfig();

    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<SiteConfig>).detail;
      if (detail) {
        setSiteConfig(detail);
        applySiteConfigToDocument(detail);
      }
    };
    window.addEventListener(SITE_CONFIG_EVENT, onUpdated);
    return () => window.removeEventListener(SITE_CONFIG_EVENT, onUpdated);
  }, [refreshSiteConfig]);

  return { siteConfig, refreshSiteConfig };
}

export async function processImageFileToPngDataUrl(file: File, maxDimension = 512): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WebP, or SVG).');
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error('Selected file is too large (max 6 MB).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode the selected image.'));
      el.src = objectUrl;
    });

    const naturalW = img.naturalWidth || maxDimension;
    const naturalH = img.naturalHeight || maxDimension;
    const scale = Math.min(1, maxDimension / Math.max(naturalW, naturalH));
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas is unavailable to process this image.');
    }
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

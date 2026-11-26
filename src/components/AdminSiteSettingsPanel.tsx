import React, { useEffect, useState } from 'react';
import {
  Bell,
  Eye,
  Globe,
  Image as ImageIcon,
  MonitorSmartphone,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  DEFAULT_SITE_CONFIG,
  emitSiteConfigUpdated,
  processImageFileToPngDataUrl,
} from '../lib/siteConfig';
import type { SiteConfig } from '../types';
import { BrandSplashScreen, VantageLogo } from './BrandMark';

type BrandTab = 'identity' | 'media' | 'splash' | 'welcome';

export const AdminSiteSettingsPanel: React.FC<{
  onFlash: (msg: string) => void;
  onError: (msg: string) => void;
}> = ({ onFlash, onError }) => {
  const [form, setForm] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<BrandTab>('identity');
  const [fullscreenSplashPreview, setFullscreenSplashPreview] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ config: SiteConfig }>('/api/site-config')
      .then((res) => {
        if (res.config) setForm({ ...DEFAULT_SITE_CONFIG, ...res.config });
      })
      .catch((err: any) => onError(err?.message || 'Unable to load site configuration.'))
      .finally(() => setLoading(false));
  }, []);

  const updateField = <K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleUploadImage = async (
    file: File | undefined,
    field: 'logoUrl' | 'iconUrl' | 'splashImageUrl',
    maxDim: number
  ) => {
    if (!file) return;
    onError('');
    try {
      const dataUrl = await processImageFileToPngDataUrl(file, maxDim);
      updateField(field, dataUrl);
      onFlash('Image prepared. Click "Save Site & Branding" to publish it live.');
    } catch (err: any) {
      onError(err?.message || 'Could not process image upload.');
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onError('');
    setSaving(true);
    try {
      const res = await api.put<{ ok: boolean; config: SiteConfig }>('/api/admin/site-config', form);
      if (res.config) {
        setForm({ ...DEFAULT_SITE_CONFIG, ...res.config });
        emitSiteConfigUpdated(res.config);
      }
      onFlash('Site branding, splash screen, icons, and copy saved live across the app.');
    } catch (err: any) {
      onError(err?.message || 'Failed to save site configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-48 rounded-2xl bg-slate-100 animate-pulse" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {fullscreenSplashPreview && (
        <BrandSplashScreen
          config={form}
          preview={false}
          onSkip={() => setFullscreenSplashPreview(false)}
        />
      )}

      {/* Sub-navigation + Save CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {(
            [
              { id: 'identity', label: 'App Name & Copy', icon: Globe },
              { id: 'media', label: 'Logo & App Icon', icon: ImageIcon },
              { id: 'splash', label: 'Splash Screen', icon: MonitorSmartphone },
              { id: 'welcome', label: 'Welcome & Access', icon: Bell },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Site & Branding'}</span>
        </button>
      </div>

      {activeTab === 'identity' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Application Identity & Descriptions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Changes apply immediately to headers, browser tabs, PWA install metadata, and the welcome landing page.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">App Name</label>
              <input
                type="text"
                required
                maxLength={80}
                value={form.appName}
                onChange={(e) => updateField('appName', e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Home Screen Short Name (max 16 chars)
              </label>
              <input
                type="text"
                required
                maxLength={16}
                value={form.shortName}
                onChange={(e) => updateField('shortName', e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Operator / Company Name</label>
              <input
                type="text"
                required
                maxLength={120}
                value={form.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Support Email</label>
              <input
                type="email"
                required
                maxLength={120}
                value={form.supportEmail}
                onChange={(e) => updateField('supportEmail', e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
              <input
                type="text"
                maxLength={120}
                value={form.tagline}
                onChange={(e) => updateField('tagline', e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Footer Attribution Text</label>
              <input
                type="text"
                maxLength={160}
                value={form.footerText}
                onChange={(e) => updateField('footerText', e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Landing Hero Headline</label>
            <input
              type="text"
              required
              maxLength={180}
              value={form.heroHeadline}
              onChange={(e) => updateField('heroHeadline', e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Landing Hero Description</label>
            <textarea
              rows={3}
              required
              maxLength={600}
              value={form.heroDescription}
              onChange={(e) => updateField('heroDescription', e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              SEO &amp; Social Share Meta Description
            </label>
            <textarea
              rows={2}
              required
              maxLength={400}
              value={form.metaDescription}
              onChange={(e) => updateField('metaDescription', e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Optional Site-Wide Announcement Banner (leave blank to hide)
            </label>
            <input
              type="text"
              maxLength={240}
              value={form.announcementBanner}
              onChange={(e) => updateField('announcementBanner', e.target.value)}
              placeholder="e.g. New Creator Discovery Packages are now live!"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>
        </div>
      )}

      {activeTab === 'media' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Site Logo */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Site Logo</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Shown in the navigation header, sidebar, and sign-in screens.
                </p>
              </div>
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={() => updateField('logoUrl', '')}
                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Default</span>
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
              <VantageLogo
                size={44}
                logoUrl={form.logoUrl}
                alt={form.appName}
                accentColor={form.themeColor}
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 font-display truncate">{form.appName}</p>
                <p className="text-xs text-slate-500 truncate">{form.companyName}</p>
              </div>
            </div>

            <label className="min-h-[44px] px-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4 text-blue-700" />
              <span>Upload Logo Image (PNG, JPG, WebP, SVG)</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void handleUploadImage(e.target.files?.[0], 'logoUrl', 512)}
              />
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Or Paste HTTPS Image URL</label>
              <input
                type="text"
                value={form.logoUrl.startsWith('data:') ? '' : form.logoUrl}
                onChange={(e) => updateField('logoUrl', e.target.value)}
                placeholder={form.logoUrl.startsWith('data:') ? 'Uploaded image active (or paste URL to replace)' : 'https://...'}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
            </div>
          </div>

          {/* App Icon & Theme Color */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">App Icon &amp; Brand Color</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updates browser favicon, iOS touch icon, and installable PWA home screen icon.
                </p>
              </div>
              {form.iconUrl && (
                <button
                  type="button"
                  onClick={() => updateField('iconUrl', '')}
                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Default</span>
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                <img
                  src={form.iconUrl || '/pwa-192x192.png'}
                  alt={`${form.appName} app icon`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">{form.shortName}</p>
                <p className="text-xs text-slate-500 mt-0.5">Home screen &amp; tab icon preview</p>
              </div>
            </div>

            <label className="min-h-[44px] px-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4 text-blue-700" />
              <span>Upload Square App Icon (512×512 PNG recommended)</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void handleUploadImage(e.target.files?.[0], 'iconUrl', 512)}
              />
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Or Paste HTTPS Icon URL</label>
              <input
                type="text"
                value={form.iconUrl.startsWith('data:') ? '' : form.iconUrl}
                onChange={(e) => updateField('iconUrl', e.target.value)}
                placeholder={form.iconUrl.startsWith('data:') ? 'Uploaded icon active (or paste URL to replace)' : 'https://...'}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Theme Color</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={form.themeColor}
                  onChange={(e) => updateField('themeColor', e.target.value.toUpperCase())}
                  className="h-11 w-14 rounded-xl border border-slate-200 bg-white p-1 cursor-pointer"
                />
                <input
                  type="text"
                  value={form.themeColor}
                  onChange={(e) => updateField('themeColor', e.target.value.toUpperCase())}
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'splash' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">App Launch Splash Screen</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Shown briefly once when the app opens (never interrupts tab switching).
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.splashEnabled}
                  onChange={(e) => updateField('splashEnabled', e.target.checked)}
                  className="w-4 h-4 accent-blue-700"
                />
                <span>Enabled</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Splash Title</label>
                <input
                  type="text"
                  maxLength={80}
                  value={form.splashTitle}
                  onChange={(e) => updateField('splashTitle', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Display Duration</label>
                <select
                  value={String(form.splashDurationMs)}
                  onChange={(e) => updateField('splashDurationMs', Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                >
                  <option value="0">Instant (0 ms)</option>
                  <option value="600">Quick (0.6s)</option>
                  <option value="900">Balanced (0.9s)</option>
                  <option value="1400">Standard (1.4s)</option>
                  <option value="2200">Showcase (2.2s)</option>
                  <option value="3000">Extended (3.0s)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Splash Subtitle</label>
              <input
                type="text"
                maxLength={140}
                value={form.splashSubtitle}
                onChange={(e) => updateField('splashSubtitle', e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.splashBgColor}
                    onChange={(e) => updateField('splashBgColor', e.target.value.toUpperCase())}
                    className="h-10 w-12 rounded-lg border border-slate-200 p-1 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.splashBgColor}
                    onChange={(e) => updateField('splashBgColor', e.target.value.toUpperCase())}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Text Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.splashTextColor}
                    onChange={(e) => updateField('splashTextColor', e.target.value.toUpperCase())}
                    className="h-10 w-12 rounded-lg border border-slate-200 p-1 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.splashTextColor}
                    onChange={(e) => updateField('splashTextColor', e.target.value.toUpperCase())}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.splashAccentColor}
                    onChange={(e) => updateField('splashAccentColor', e.target.value.toUpperCase())}
                    className="h-10 w-12 rounded-lg border border-slate-200 p-1 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.splashAccentColor}
                    onChange={(e) => updateField('splashAccentColor', e.target.value.toUpperCase())}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Optional Custom Splash Graphic (defaults to Site Logo)
                </label>
                {form.splashImageUrl && (
                  <button
                    type="button"
                    onClick={() => updateField('splashImageUrl', '')}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    Use Site Logo
                  </button>
                )}
              </div>
              <label className="min-h-[44px] px-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-blue-700" />
                <span>Upload Custom Splash Image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void handleUploadImage(e.target.files?.[0], 'splashImageUrl', 512)}
                />
              </label>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-700" />
                <span>Live Splash Preview</span>
              </h3>
              <button
                type="button"
                onClick={() => setFullscreenSplashPreview(true)}
                className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Test Fullscreen</span>
              </button>
            </div>
            <BrandSplashScreen config={form} preview />
          </div>
        </div>
      )}

      {activeTab === 'welcome' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-slate-900">Creator Welcome Notification &amp; Access</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize the automatic welcome message sent to new creators and control public sign-ups.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Welcome Notification Title</label>
            <input
              type="text"
              required
              maxLength={120}
              value={form.welcomeNotifTitle}
              onChange={(e) => updateField('welcomeNotifTitle', e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Welcome Notification Message (use <code className="font-mono">{'{name}'}</code> for the user&apos;s name)
            </label>
            <textarea
              rows={4}
              required
              maxLength={600}
              value={form.welcomeNotifMessage}
              onChange={(e) => updateField('welcomeNotifMessage', e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Allow Public Account Registrations</p>
              <p className="text-xs text-slate-500">
                When paused, only existing users and staff can sign in.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={form.registrationsOpen}
                onChange={(e) => updateField('registrationsOpen', e.target.checked)}
                className="w-4 h-4 accent-blue-700"
              />
              <span>{form.registrationsOpen ? 'Open' : 'Paused'}</span>
            </label>
          </div>
        </div>
      )}
    </form>
  );
};

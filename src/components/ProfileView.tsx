import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  Smartphone,
  User as UserIcon,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { api, formatCurrency, formatDateTime, formatStatusLabel } from '../lib/api';
import { useSiteConfig } from '../lib/siteConfig';
import type { NotificationRecord, PaymentRecord, UserSession } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileViewProps {
  user: UserSession;
  onLogout: () => void;
  onUserUpdated: () => void;
  onOpenAdmin?: () => void;
  onOpenNotification?: (n: NotificationRecord) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onLogout,
  onUserUpdated,
  onOpenAdmin,
  onOpenNotification,
}) => {
  const { siteConfig } = useSiteConfig();
  const { isInstalled, updateState, lastSyncedAt, buildId, checkForUpdate } = usePWAInstall();
  const [fullName, setFullName] = useState(user.fullName || '');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('United States');
  const [channelHandle, setChannelHandle] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const loadAll = () => {
      Promise.all([
        api.get<{ profile: any }>('/api/profile'),
        api.get<{ payments: PaymentRecord[] }>('/api/payments'),
        api.get<{ notifications: NotificationRecord[] }>('/api/notifications'),
      ])
        .then(([pRes, payRes, nRes]) => {
          if (pRes.profile) {
            setFullName(pRes.profile.full_name || '');
            setPhone(pRes.profile.phone || '');
            setCountry(pRes.profile.country || 'United States');
            setChannelHandle(pRes.profile.channel_handle || '');
            setNotifyEmail(Boolean(pRes.profile.notify_email));
            setNotifyInApp(Boolean(pRes.profile.notify_in_app));
          }
          setPayments(payRes.payments);
          setNotifications(nRes.notifications);
        })
        .catch((err) => setError(err.message || 'Could not load profile.'));
    };

    loadAll();
    const syncNotificationsOnly = () => {
      api
        .get<{ notifications: NotificationRecord[] }>('/api/notifications')
        .then((nRes) => setNotifications(nRes.notifications))
        .catch(() => {});
    };
    window.addEventListener('vantage:notifications-sync', syncNotificationsOnly);
    return () => window.removeEventListener('vantage:notifications-sync', syncNotificationsOnly);
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      await api.put('/api/profile', {
        fullName,
        phone,
        country,
        channelHandle,
        notifyEmail,
        notifyInApp,
      });
      onUserUpdated();
      setMessage('Account profile updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/api/profile/change-password', {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    }
  };

  const handleSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/api/support', { subject: supportSubject, message: supportMessage });
      setSupportSubject('');
      setSupportMessage('');
      setMessage(`Support request submitted to ${siteConfig.companyName}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit support message.');
    }
  };

  const handleMarkAllRead = async () => {
    await api.post('/api/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    window.dispatchEvent(new CustomEvent('vantage:app-sync'));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profile &amp; Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {user.email} · {siteConfig.appName} Account
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton showFallback />
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4 text-red-600" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          {message}
        </div>
      )}

      {user.isAdmin && onOpenAdmin && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Administration Console</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Manage campaigns, customer accounts, payments, YouTube snapshots, Gemini SEO config, and staff roles (
                {formatStatusLabel(user.adminRole || 'admin')}).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
          >
            <span>Open Admin Console</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {/* Installable App & Automatic Update Sync */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-base font-bold text-slate-900">App Installation &amp; Live Update Sync</h2>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                isInstalled
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                  : 'bg-blue-50 text-[#2563EB] border border-blue-200/80'
              }`}
            >
              {isInstalled ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Installed App</span>
                </>
              ) : (
                <span>Web Browser</span>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Install {siteConfig.appName} on Android, iPhone, iPad, Windows, or Mac. Any new features or fixes deployed to {siteConfig.appName} sync automatically whenever you open the app online.
          </p>
          <p className="text-[11px] text-slate-400">
            Build <span className="font-mono">{buildId}</span>
            {lastSyncedAt ? ` · Last checked ${formatDateTime(lastSyncedAt)}` : ''}
            {updateState === 'up-to-date' ? ' · App is up to date' : ''}
            {updateState === 'updating' ? ' · Updating to latest version...' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <PWAInstallButton showFallback />
          <button
            type="button"
            disabled={updateState === 'checking' || updateState === 'updating'}
            onClick={() => void checkForUpdate()}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-xs font-semibold text-slate-800 hover:text-[#2563EB] inline-flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                updateState === 'checking' || updateState === 'updating' ? 'animate-spin text-[#2563EB]' : ''
              }`}
            />
            <span>
              {updateState === 'checking'
                ? 'Checking...'
                : updateState === 'updating'
                  ? 'Updating...'
                  : updateState === 'up-to-date'
                    ? 'Up to Date'
                    : 'Sync Updates'}
            </span>
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Account Details */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-blue-700" />
            <span>Account Details</span>
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone (Optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">YouTube Channel Handle</label>
            <input
              type="text"
              value={channelHandle}
              onChange={(e) => setChannelHandle(e.target.value)}
              placeholder="@yourchannel"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 min-h-[36px]">
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Email campaign &amp; billing updates</span>
            </label>
            <label className="inline-flex items-center gap-2 min-h-[36px]">
              <input
                type="checkbox"
                checked={notifyInApp}
                onChange={(e) => setNotifyInApp(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>In-app notifications</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Account Settings'}
          </button>
        </form>

        {/* Password Management */}
        <form
          onSubmit={handleChangePassword}
          className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-700" />
            <span>Password Management</span>
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (min 8 chars)</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
          </div>

          <button
            type="submit"
            className="min-h-[44px] px-5 py-2 rounded-xl border border-slate-200 bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            Update Password
          </button>
        </form>
      </div>

      {/* Payment History */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-blue-700" />
          <span>Payment History</span>
        </h2>

        {payments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Reference</th>
                  <th className="py-2.5 pr-4 font-semibold">Item</th>
                  <th className="py-2.5 pr-4 font-semibold">Provider</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Amount</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 pr-4 font-mono text-slate-900 whitespace-nowrap">{p.tx_ref}</td>
                    <td className="py-3 pr-4 text-slate-700">{p.campaign_title || p.service_name || p.order_ref || 'Service'}</td>
                    <td className="py-3 pr-4 uppercase text-slate-600">{p.provider}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(p.amount, p.currency)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-slate-800">{formatStatusLabel(p.status)}</span>
                      {p.failure_reason && <span className="block text-[11px] text-red-600">{p.failure_reason}</span>}
                    </td>
                    <td className="py-3 text-slate-500 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Notifications Center */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-700" />
              <span>Notifications</span>
            </h2>
            {notifications.some((n) => n.is_read === 0) ? (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                Mark all read
              </button>
            ) : (
              <span className="text-[11px] font-medium text-slate-400">All caught up</span>
            )}
          </div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto -mx-2 px-2">
            {notifications.length === 0 ? (
              <p className="py-6 text-xs text-slate-500 text-center">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (n.is_read === 0) {
                      setNotifications((prev) =>
                        prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item))
                      );
                    }
                    onOpenNotification?.(n);
                  }}
                  className={`w-full py-3 px-2.5 rounded-xl text-left text-xs transition-colors hover:bg-slate-50 ${
                    n.is_read === 0 ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className={n.is_read ? 'text-slate-700' : 'text-blue-700'}>{n.title}</strong>
                    <span className="text-slate-400 shrink-0 tabular-nums">{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Support */}
        <form onSubmit={handleSupport} className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-700" />
            <span>Creator Support</span>
          </h2>
          <p className="text-xs text-slate-500">
            Need help with a campaign, payment verification, or SEO order? Message {siteConfig.companyName} ({siteConfig.supportEmail}).
          </p>
          <input
            type="text"
            required
            value={supportSubject}
            onChange={(e) => setSupportSubject(e.target.value)}
            placeholder="Subject"
            className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
          />
          <textarea
            required
            rows={3}
            value={supportMessage}
            onChange={(e) => setSupportMessage(e.target.value)}
            placeholder="Describe your question or campaign reference..."
            className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
          />
          <button
            type="submit"
            className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
          >
            Send Support Request
          </button>
        </form>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Crown,
  ExternalLink,
  Link2,
  ShieldCheck,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import { api, formatCurrency } from '../lib/api';
import type { PackageRecord, VideoRecord } from '../types';
import { ThumbnailImage } from './BrandMark';

interface PackagesAndCheckoutViewProps {
  selectedVideoId: number | null;
  onSelectVideo: (id: number) => void;
  onSuccessNavigate: (tab: string) => void;
  onPaymentSuccess?: () => void;
}

interface CheckoutSession {
  txRef: string;
  provider: string;
  mode: string;
  checkoutUrl: string | null;
  amount: number;
  currency: string;
  packageName: string;
  notice?: string;
}

function isSafeHttpsUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export const PackagesAndCheckoutView: React.FC<PackagesAndCheckoutViewProps> = ({
  selectedVideoId,
  onSelectVideo,
  onSuccessNavigate,
  onPaymentSuccess,
}) => {
  const [tab, setTab] = useState<'promotion' | 'seo_service'>('promotion');
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [currency, setCurrency] = useState<'USD' | 'NGN'>('USD');
  const [provider, setProvider] = useState<'paystack' | 'flutterwave' | 'sandbox'>('flutterwave');
  const [targetRegions, setTargetRegions] = useState('Global (US, UK, Nigeria, Europe)');
  const [selectedPkg, setSelectedPkg] = useState<PackageRecord | null>(null);

  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ packages: PackageRecord[]; defaultProvider: 'paystack' | 'flutterwave' | 'sandbox' }>('/api/packages'),
      api.get<{ videos: VideoRecord[] }>('/api/videos'),
    ])
      .then(([pkgRes, vidRes]) => {
        setPackages(pkgRes.packages);
        setProvider(pkgRes.defaultProvider || 'flutterwave');
        setVideos(vidRes.videos);
        if (!selectedVideoId && vidRes.videos[0]) {
          onSelectVideo(vidRes.videos[0].id);
        }
        const hasPromo = pkgRes.packages.some((p) => p.kind === 'promotion');
        const hasSeo = pkgRes.packages.some((p) => p.kind === 'seo_service');
        if (!hasPromo && hasSeo) {
          setTab('seo_service');
        }
      })
      .catch((err) => setError(err.message || 'Could not load promotion options.'))
      .finally(() => setLoading(false));
  }, []);

  const hasMultipleKinds =
    packages.some((p) => p.kind === 'promotion') && packages.some((p) => p.kind === 'seo_service');
  const filteredPackages = hasMultipleKinds ? packages.filter((p) => p.kind === tab) : packages;
  const isSinglePageFlow = filteredPackages.length === 1;
  const singlePkg = isSinglePageFlow ? filteredPackages[0] : null;
  const activeVideo = videos.find((v) => v.id === selectedVideoId) || videos[0] || null;

  const isChannelSubmission = Boolean(
    activeVideo &&
      (activeVideo.youtube_video_id?.startsWith('ch:') ||
        (activeVideo.channel_url && activeVideo.channel_url === activeVideo.url))
  );
  const activeLinkUrl =
    isChannelSubmission
      ? activeVideo?.channel_url || activeVideo?.url
      : activeVideo?.url || activeVideo?.channel_url;

  const handleStartCheckout = async (pkgOverride?: PackageRecord) => {
    const pkgToBuy = pkgOverride || selectedPkg;
    if (!pkgToBuy) return;
    const targetVideoId = activeVideo?.id || selectedVideoId;
    if (!targetVideoId) {
      setError('Please drop a YouTube channel link or video link first.');
      return;
    }
    setError('');
    setSuccessMsg('');
    setProcessing(true);
    try {
      const idemKey = `vr-${pkgToBuy.id}-${targetVideoId}-${Date.now()}`;
      const res = await api.post<{
        freeIncluded?: boolean;
        payment?: { tx_ref: string; amount: number; currency: string; provider: string };
        mode?: string;
        checkoutUrl?: string | null;
        notice?: string;
      }>('/api/checkout', {
        packageId: pkgToBuy.id,
        videoId: targetVideoId,
        currency,
        provider,
        targetRegions,
        idempotencyKey: idemKey,
      });

      if (res.freeIncluded) {
        setSelectedPkg(null);
        window.dispatchEvent(new CustomEvent('vantage:app-sync'));
        onPaymentSuccess?.();
        onSuccessNavigate('campaigns');
        return;
      }

      if (res.payment) {
        setCheckoutSession({
          txRef: res.payment.tx_ref,
          provider: res.payment.provider,
          mode: res.mode || 'sandbox_checkout',
          checkoutUrl: isSafeHttpsUrl(res.checkoutUrl) ? res.checkoutUrl : null,
          amount: res.payment.amount,
          currency: res.payment.currency,
          packageName: pkgToBuy.name,
          notice: res.notice,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Could not initiate checkout.');
    } finally {
      setProcessing(false);
    }
  };

  const handleServerVerify = async (outcome: 'succeed' | 'fail') => {
    if (!checkoutSession) return;
    setProcessing(true);
    setError('');
    try {
      const res = await api.post<{ verified: boolean; failureReason?: string }>('/api/payments/verify', {
        txRef: checkoutSession.txRef,
        simulateOutcome: outcome,
      });
      if (res.verified) {
        setCheckoutSession(null);
        setSelectedPkg(null);
        window.dispatchEvent(new CustomEvent('vantage:app-sync'));
        onPaymentSuccess?.();
        onSuccessNavigate('campaigns');
      } else {
        setError(`Payment verification status: ${res.failureReason || 'Not completed yet'}`);
      }
    } catch (err: any) {
      setError(err.message || 'Server verification error.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {hasMultipleKinds ? 'Plans & Services' : 'Promote Your Channel or Video ($1)'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {hasMultipleKinds
              ? 'YouTube promotion campaigns and services'
              : 'Complete your $1 membership payment below to promote your YouTube channel or video on our platform.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {(['USD', 'NGN'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                  currency === c ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {videos.length > 1 && (
            <select
              aria-label="Target Channel or Video"
              value={activeVideo?.id || ''}
              onChange={(e) => onSelectVideo(Number(e.target.value))}
              className="min-h-[44px] max-w-xs px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Category Switcher (shown only when both promotion and SEO packages are active) */}
      {hasMultipleKinds && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
          <button
            type="button"
            onClick={() => setTab('promotion')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'promotion' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Promotion Campaigns
          </button>
          <button
            type="button"
            onClick={() => setTab('seo_service')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'seo_service' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            SEO Optimization Services
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => onSuccessNavigate('campaigns')}
            className="min-h-[38px] px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 whitespace-nowrap"
          >
            View My Campaigns
          </button>
        </div>
      )}

      {videos.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
          <div className="space-y-1">
            <p className="text-sm font-bold">Drop your channel link or video link first</p>
            <p>Once you drop either a YouTube channel link or a video link, you can pay $1 right here to promote it.</p>
          </div>
          <button
            type="button"
            onClick={() => onSuccessNavigate('submit')}
            className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] text-white font-semibold shrink-0 hover:bg-[#1D4ED8]"
          >
            Drop Channel or Video Link
          </button>
        </div>
      ) : (
        activeVideo && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              {isChannelSubmission ? (
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                  <Tv className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-20 aspect-video rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  <ThumbnailImage src={activeVideo.thumbnail_url} alt={activeVideo.title} />
                </div>
              )}
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB]">
                  <Link2 className="w-3 h-3" />
                  <span>{isChannelSubmission ? 'YouTube Channel Selected' : 'YouTube Video Selected'}</span>
                </span>
                <p className="text-sm font-bold text-slate-900 truncate">{activeVideo.title}</p>
                {isSafeHttpsUrl(activeLinkUrl) && (
                  <a
                    href={activeLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-[#2563EB] truncate max-w-full"
                  >
                    <span className="truncate">{activeLinkUrl}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSuccessNavigate('submit')}
              className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0 self-start sm:self-center"
            >
              Drop Another Link
            </button>
          </div>
        )
      )}

      {/* Single-Page $1 Promotion Flow (No Double Modals when 1 Active Package Exists) */}
      {isSinglePageFlow && singlePkg ? (
        <div className="rounded-2xl border border-amber-300 bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)] space-y-5 max-w-2xl">
          {!checkoutSession ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span>{singlePkg.name}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">{singlePkg.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-3xl font-extrabold text-slate-900 tabular-nums">
                    {formatCurrency(currency === 'NGN' ? singlePkg.price_ngn : singlePkg.price_usd, currency)}
                  </p>
                  {singlePkg.duration_days > 0 && (
                    <span className="text-[11px] font-mono text-slate-500">{singlePkg.duration_days}-day promo</span>
                  )}
                </div>
              </div>

              <ul className="space-y-2">
                {singlePkg.deliverables.map((d, idx) => (
                  <li key={idx} className="text-xs sm:text-[13px] text-slate-700 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Target Audience Regions
                  </label>
                  <input
                    type="text"
                    value={targetRegions}
                    onChange={(e) => setTargetRegions(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Payment Gateway</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'flutterwave' as const, label: 'Flutterwave' },
                      { id: 'paystack' as const, label: 'Paystack' },
                      { id: 'sandbox' as const, label: 'Test' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProvider(p.id)}
                        className={`min-h-[44px] px-2 rounded-xl border text-xs font-semibold transition-colors ${
                          provider === p.id
                            ? 'border-[#2563EB] bg-blue-50 text-[#1D4ED8]'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={processing || videos.length === 0}
                onClick={() => handleStartCheckout(singlePkg)}
                className="w-full min-h-[52px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm sm:text-[15px] font-semibold shadow-md shadow-blue-600/20 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {processing
                    ? 'Starting Checkout...'
                    : `Pay ${formatCurrency(currency === 'NGN' ? singlePkg.price_ngn : singlePkg.price_usd, currency)} & Promote Now`}
                </span>
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Complete Your Promotion Payment</h2>
                <button
                  type="button"
                  onClick={() => setCheckoutSession(null)}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-xs">
                <p className="text-slate-500">
                  Reference: <strong className="font-mono text-slate-900">{checkoutSession.txRef}</strong>
                </p>
                <p className="text-slate-500">
                  Plan: <strong className="text-slate-900">{checkoutSession.packageName}</strong>
                </p>
                <p className="text-slate-500">
                  Amount:{' '}
                  <strong className="font-mono tabular-nums text-[#2563EB]">
                    {formatCurrency(checkoutSession.amount, checkoutSession.currency)}
                  </strong>{' '}
                  via {checkoutSession.provider.toUpperCase()}
                </p>
              </div>

              {checkoutSession.notice && (
                <p className="text-xs text-slate-600 leading-relaxed">{checkoutSession.notice}</p>
              )}

              {checkoutSession.checkoutUrl ? (
                <div className="space-y-3">
                  <a
                    href={checkoutSession.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[50px] rounded-2xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
                  >
                    <span>Pay with {checkoutSession.provider.toUpperCase()}</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => handleServerVerify('succeed')}
                    className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold hover:bg-slate-50"
                  >
                    {processing ? 'Verifying Payment...' : "I've Completed Payment — Go to My Campaigns"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => handleServerVerify('succeed')}
                    className="w-full min-h-[50px] rounded-2xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{processing ? 'Activating Promotion...' : 'Confirm Payment & Launch Promotion'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => handleServerVerify('fail')}
                    className="w-full min-h-[42px] rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 inline-flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Test Failed Payment Handling</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <span>
              <strong>Legitimate Promotion Standard:</strong> All Vantage Reach campaigns use compliant audience discovery, creator partnerships, and targeted advertising. We never sell artificial views, purchased subscribers, watch-hour manipulation, or guaranteed monetization.
            </span>
          </div>

          <div
            className={`grid gap-4 ${
              filteredPackages.length === 2
                ? 'grid-cols-1 md:grid-cols-2 max-w-4xl'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {filteredPackages.map((pkg) => {
              const price = currency === 'NGN' ? pkg.price_ngn : pkg.price_usd;
              const isVip = pkg.code === 'vip_membership' || pkg.code.startsWith('vip_');
              const isPopular = pkg.code === 'promo_7d' || pkg.code === 'seo_complete';
              return (
                <div
                  key={pkg.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between bg-white ${
                    isVip
                      ? 'border-amber-400 ring-1 ring-amber-400/30 bg-gradient-to-b from-amber-50/40 to-white'
                      : isPopular
                        ? 'border-blue-600 ring-1 ring-blue-600/15'
                        : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-1.5">
                        {isVip && <Crown className="w-4 h-4 text-amber-500 shrink-0" />}
                        <span>{pkg.name}</span>
                      </h2>
                      {pkg.duration_days > 0 && (
                        <span className="text-xs font-mono text-slate-500">{pkg.duration_days}d</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{pkg.description}</p>
                    <p className="text-3xl font-bold text-slate-900 tabular-nums mt-4">
                      {price <= 0 ? 'Included' : formatCurrency(price, currency)}
                    </p>

                    <ul className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                      {pkg.deliverables.map((d, idx) => (
                        <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    disabled={videos.length === 0}
                    onClick={() => setSelectedPkg(pkg)}
                    className={`mt-6 w-full min-h-[44px] rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isVip
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : isPopular
                          ? 'bg-blue-700 text-white hover:bg-blue-800'
                          : 'border border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {isVip ? 'Pay $1 Membership & Promote' : 'Review Deliverables & Select'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Multi-Package Checkout Modal */}
      {!isSinglePageFlow && selectedPkg && !checkoutSession && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 p-0 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Review Order &amp; Checkout</h3>
              <button
                type="button"
                onClick={() => setSelectedPkg(null)}
                aria-label="Close checkout"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{selectedPkg.name}</span>
                <span className="text-base font-bold font-mono tabular-nums text-blue-700">
                  {(currency === 'NGN' ? selectedPkg.price_ngn : selectedPkg.price_usd) <= 0
                    ? 'Included'
                    : formatCurrency(
                        currency === 'NGN' ? selectedPkg.price_ngn : selectedPkg.price_usd,
                        currency
                      )}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Target: {activeVideo?.title || 'Selected Link'}
              </p>
              {activeLinkUrl && <p className="text-xs text-slate-500 truncate">Link: {activeLinkUrl}</p>}
              <ul className="pt-2 space-y-1 text-xs text-slate-700">
                {selectedPkg.deliverables.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            </div>

            {selectedPkg.kind === 'promotion' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Target Audience Regions
                </label>
                <input
                  type="text"
                  value={targetRegions}
                  onChange={(e) => setTargetRegions(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Payment Provider</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'flutterwave' as const, label: 'Flutterwave' },
                  { id: 'paystack' as const, label: 'Paystack' },
                  { id: 'sandbox' as const, label: 'Test Gateway' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors ${
                      provider === p.id
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={processing}
              onClick={() => handleStartCheckout(selectedPkg)}
              className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>{processing ? 'Initializing Payment...' : 'Proceed to Server Checkout'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Multi-Package Verification Modal */}
      {!isSinglePageFlow && checkoutSession && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 p-0 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Server Payment Verification</h3>
              <button
                type="button"
                onClick={() => setCheckoutSession(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-xs">
              <p className="text-slate-500">
                Reference: <strong className="font-mono text-slate-900">{checkoutSession.txRef}</strong>
              </p>
              <p className="text-slate-500">
                Service: <strong className="text-slate-900">{checkoutSession.packageName}</strong>
              </p>
              <p className="text-slate-500">
                Amount:{' '}
                <strong className="font-mono tabular-nums text-blue-700">
                  {formatCurrency(checkoutSession.amount, checkoutSession.currency)}
                </strong>{' '}
                via {checkoutSession.provider.toUpperCase()}
              </p>
            </div>

            {checkoutSession.notice && (
              <p className="text-xs text-slate-600 leading-relaxed">{checkoutSession.notice}</p>
            )}

            {checkoutSession.checkoutUrl ? (
              <div className="space-y-3">
                <a
                  href={checkoutSession.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-2"
                >
                  <span>Pay with {checkoutSession.provider.toUpperCase()}</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleServerVerify('succeed')}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold hover:bg-slate-50"
                >
                  {processing ? 'Verifying...' : "I've Completed Payment — Go to My Campaigns"}
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleServerVerify('succeed')}
                  className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{processing ? 'Verifying...' : 'Confirm Payment & Launch Promotion'}</span>
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleServerVerify('fail')}
                  className="w-full min-h-[44px] rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 inline-flex items-center justify-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Test Failed Payment Handling</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

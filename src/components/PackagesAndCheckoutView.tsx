import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Sparkles,
  X,
  AlertTriangle,
} from 'lucide-react';
import { api, formatCurrency } from '../lib/api';
import type { PackageRecord, VideoRecord } from '../types';

interface PackagesAndCheckoutViewProps {
  selectedVideoId: number | null;
  onSelectVideo: (id: number) => void;
  onSuccessNavigate: (tab: string) => void;
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

export const PackagesAndCheckoutView: React.FC<PackagesAndCheckoutViewProps> = ({
  selectedVideoId,
  onSelectVideo,
  onSuccessNavigate,
}) => {
  const [tab, setTab] = useState<'promotion' | 'seo_service'>('promotion');
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [currency, setCurrency] = useState<'USD' | 'NGN'>('USD');
  const [provider, setProvider] = useState<'paystack' | 'flutterwave' | 'sandbox'>('paystack');
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
        setProvider(pkgRes.defaultProvider || 'paystack');
        setVideos(vidRes.videos);
        if (!selectedVideoId && vidRes.videos[0]) {
          onSelectVideo(vidRes.videos[0].id);
        }
      })
      .catch((err) => setError(err.message || 'Could not load packages.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredPackages = packages.filter((p) => p.kind === tab);

  const handleStartCheckout = async () => {
    if (!selectedPkg) return;
    if (!selectedVideoId) {
      setError('Please submit or select a YouTube video first.');
      return;
    }
    setError('');
    setSuccessMsg('');
    setProcessing(true);
    try {
      const idemKey = `vr-${selectedPkg.id}-${selectedVideoId}-${Date.now()}`;
      const res = await api.post<{
        freeIncluded?: boolean;
        payment?: { tx_ref: string; amount: number; currency: string; provider: string };
        mode?: string;
        checkoutUrl?: string | null;
        notice?: string;
      }>('/api/checkout', {
        packageId: selectedPkg.id,
        videoId: selectedVideoId,
        currency,
        provider,
        targetRegions,
        idempotencyKey: idemKey,
      });

      if (res.freeIncluded) {
        setSelectedPkg(null);
        setSuccessMsg(`${selectedPkg.name} queued for your video at no cost.`);
        return;
      }

      if (res.payment) {
        setCheckoutSession({
          txRef: res.payment.tx_ref,
          provider: res.payment.provider,
          mode: res.mode || 'sandbox_checkout',
          checkoutUrl: res.checkoutUrl || null,
          amount: res.payment.amount,
          currency: res.payment.currency,
          packageName: selectedPkg.name,
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
        setSuccessMsg(
          `Payment ${checkoutSession.txRef} verified server-side. Your order is now active in the fulfillment queue.`
        );
      } else {
        setError(`Payment verification declined: ${res.failureReason || 'Declined'}`);
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plans &amp; Services</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Legitimate YouTube audience discovery campaigns and specialist SEO services
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

          <select
            aria-label="Target Video"
            value={selectedVideoId || ''}
            onChange={(e) => onSelectVideo(Number(e.target.value))}
            className="min-h-[44px] max-w-xs px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
          >
            {videos.length === 0 ? (
              <option value="">No videos submitted yet</option>
            ) : (
              videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Category Switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        <button
          type="button"
          onClick={() => setTab('promotion')}
          className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'promotion' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Promotion Campaigns (1 / 7 / 30d)
        </button>
        <button
          type="button"
          onClick={() => setTab('seo_service')}
          className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'seo_service' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          SEO Optimization Services (A–F)
        </button>
      </div>

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

      {videos.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-3 text-xs text-amber-900">
          <span>Submit a YouTube video first before purchasing a promotion or SEO package.</span>
          <button
            type="button"
            onClick={() => onSuccessNavigate('submit')}
            className="min-h-[38px] px-4 rounded-lg bg-amber-900 text-white font-semibold shrink-0"
          >
            Submit Video
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <span>
          <strong>Legitimate Promotion Standard:</strong> All Vantage Reach campaigns use compliant audience discovery, creator partnerships, and targeted advertising. We never sell artificial views, purchased subscribers, watch-hour manipulation, or guaranteed monetization.
        </span>
      </div>

      {/* Package Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filteredPackages.map((pkg) => {
          const price = currency === 'NGN' ? pkg.price_ngn : pkg.price_usd;
          const isPopular = pkg.code === 'promo_7d' || pkg.code === 'seo_complete';
          return (
            <div
              key={pkg.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between bg-white ${
                isPopular ? 'border-blue-600 ring-1 ring-blue-600/15' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">{pkg.name}</h2>
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
                  isPopular
                    ? 'bg-blue-700 text-white hover:bg-blue-800'
                    : 'border border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                }`}
              >
                Review Deliverables &amp; Select
              </button>
            </div>
          );
        })}
      </div>

      {/* Deliverables Review & Checkout Modal */}
      {selectedPkg && !checkoutSession && (
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
                Video: {videos.find((v) => v.id === selectedVideoId)?.title || 'Selected Video'}
              </p>
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
                  { id: 'paystack' as const, label: 'Paystack' },
                  { id: 'flutterwave' as const, label: 'Flutterwave' },
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
              onClick={handleStartCheckout}
              className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>{processing ? 'Initializing Payment...' : 'Proceed to Server Checkout'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Server-Side Payment Verification Modal */}
      {checkoutSession && (
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
                  rel="noreferrer"
                  className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 flex items-center justify-center"
                >
                  Open {checkoutSession.provider.toUpperCase()} Checkout
                </a>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleServerVerify('succeed')}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold hover:bg-slate-50"
                >
                  {processing ? 'Verifying...' : 'Verify Payment Status on Server'}
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
                  <span>{processing ? 'Verifying...' : 'Authorize & Verify Payment on Server'}</span>
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

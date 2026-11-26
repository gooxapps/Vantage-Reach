import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Crown,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { api, formatCurrency } from '../lib/api';
import type { PackageRecord, VideoRecord } from '../types';
import { ThumbnailImage } from './BrandMark';

interface CreatorVipModalProps {
  video: VideoRecord;
  isAlreadyVip?: boolean;
  onClose: () => void;
  onVipActivated: () => void;
  onViewCampaigns: () => void;
}

interface VipCheckoutSession {
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
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const CreatorVipModal: React.FC<CreatorVipModalProps> = ({
  video,
  isAlreadyVip = false,
  onClose,
  onVipActivated,
  onViewCampaigns,
}) => {
  const [vipPkg, setVipPkg] = useState<PackageRecord | null>(null);
  const [flutterwaveConfigured, setFlutterwaveConfigured] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'NGN'>('USD');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [checkoutSession, setCheckoutSession] = useState<VipCheckoutSession | null>(null);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<{
        packages: PackageRecord[];
        vipPackage?: PackageRecord | null;
        flutterwaveConfigured?: boolean;
      }>('/api/packages')
      .then((res) => {
        const found =
          res.vipPackage ||
          res.packages.find((p) => p.code === 'vip_membership' || p.price_usd === 1) ||
          res.packages[0] ||
          null;
        setVipPkg(found);
        setFlutterwaveConfigured(Boolean(res.flutterwaveConfigured));
      })
      .catch((err: any) => setError(err?.message || 'Unable to load VIP membership details.'))
      .finally(() => setLoading(false));
  }, []);

  const displayName = vipPkg?.name || 'Creator VIP Club';
  const displayAmount = vipPkg ? (currency === 'NGN' ? vipPkg.price_ngn : vipPkg.price_usd) : currency === 'NGN' ? 1600 : 1;
  const deliverables =
    vipPkg?.deliverables && vipPkg.deliverables.length > 0
      ? vipPkg.deliverables
      : [
          '$1.00 membership fee to promote your video',
          'Video link & YouTube channel link sent directly to our promotion team',
          'Campaign status updates & activity tracking on your dashboard',
          '30-day Creator VIP Club member badge',
        ];

  const handleStartFlutterwave = async () => {
    if (!vipPkg) return;
    setError('');
    setProcessing(true);
    try {
      const idemKey = `vip-${vipPkg.id}-${video.id}-${Date.now()}`;
      const res = await api.post<{
        payment?: { tx_ref: string; amount: number; currency: string; provider: string };
        mode?: string;
        checkoutUrl?: string | null;
        notice?: string;
      }>('/api/checkout', {
        packageId: vipPkg.id,
        videoId: video.id,
        currency,
        provider: 'flutterwave',
        targetRegions: 'Global VIP Priority',
        idempotencyKey: idemKey,
      });

      if (res.payment) {
        setCheckoutSession({
          txRef: res.payment.tx_ref,
          provider: res.payment.provider,
          mode: res.mode || 'sandbox_checkout',
          checkoutUrl: isSafeHttpsUrl(res.checkoutUrl) ? res.checkoutUrl : null,
          amount: res.payment.amount,
          currency: res.payment.currency,
          packageName: displayName,
          notice: res.notice,
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to start Flutterwave checkout.');
    } finally {
      setProcessing(false);
    }
  };

  const handleVerifyPayment = async (simulateOutcome?: 'succeed' | 'fail') => {
    if (!checkoutSession) return;
    setError('');
    setProcessing(true);
    try {
      const res = await api.post<{
        verified?: boolean;
        alreadyVerified?: boolean;
        pending?: boolean;
        failureReason?: string;
      }>('/api/payments/verify', {
        txRef: checkoutSession.txRef,
        simulateOutcome,
      });
      if (res.verified || res.alreadyVerified) {
        setActivated(true);
        window.dispatchEvent(new CustomEvent('vantage:app-sync'));
        onVipActivated();
      } else {
        setError(res.failureReason || 'Payment has not completed yet. Finish checkout and verify again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to verify payment status.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName} Membership`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Links Saved · Promote on Our Platform
              </p>
              <h2 className="text-base font-extrabold truncate">{displayName}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close VIP offer"
            className="min-h-[40px] min-w-[40px] rounded-xl text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {loading ? (
            <div className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
          ) : activated ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Promotion Queued!</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Your $1 membership fee is verified. Our team has received your video link and channel link and will promote it on our platform.
                </p>
              </div>
              <button
                type="button"
                onClick={onViewCampaigns}
                className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <span>View My Campaigns</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Submitted Video & Channel Links Summary */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <div className="w-24 aspect-video rounded-xl overflow-hidden bg-slate-200 shrink-0">
                  <ThumbnailImage src={video.thumbnail_url} alt={video.title} />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Video &amp; Channel Links Saved</span>
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">{video.title}</p>
                  {video.channel_url && (
                    <p className="text-[11px] text-slate-500 truncate">{video.channel_url}</p>
                  )}
                </div>
              </div>

              {!checkoutSession ? (
                <>
                  {/* Price & Currency Row */}
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-blue-900">
                        {isAlreadyVip ? 'Boost Another Video as VIP' : 'Post-Upload Membership Price'}
                      </p>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                          {formatCurrency(displayAmount, currency)}
                        </span>
                        <span className="text-xs font-medium text-slate-600">only · 30 days</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-blue-100">
                      {(['USD', 'NGN'] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold ${
                            currency === c ? 'bg-slate-900 text-white' : 'text-slate-600'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Perks */}
                  <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
                    {deliverables.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      disabled={processing || !vipPkg}
                      onClick={handleStartFlutterwave}
                      className="w-full min-h-[50px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold shadow-md shadow-blue-600/20 inline-flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>
                        {processing
                          ? 'Connecting to Flutterwave...'
                          : `Pay ${formatCurrency(displayAmount, currency)} Membership & Promote`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onViewCampaigns}
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      Save for Later — View My Campaigns
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {flutterwaveConfigured
                        ? 'Secured by Flutterwave · Card, Bank Transfer, USSD & Mobile Money'
                        : 'Flutterwave server-verified checkout ready'}
                    </span>
                  </p>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-xs">
                    <p className="text-slate-500">
                      Membership: <strong className="text-slate-900">{checkoutSession.packageName}</strong>
                    </p>
                    <p className="text-slate-500">
                      Reference: <strong className="font-mono text-slate-900">{checkoutSession.txRef}</strong>
                    </p>
                    <p className="text-slate-500">
                      Amount:{' '}
                      <strong className="font-mono text-[#2563EB]">
                        {formatCurrency(checkoutSession.amount, checkoutSession.currency)}
                      </strong>{' '}
                      via Flutterwave
                    </p>
                  </div>

                  {checkoutSession.notice && (
                    <p className="text-xs text-slate-600 leading-relaxed">{checkoutSession.notice}</p>
                  )}

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  {checkoutSession.checkoutUrl ? (
                    <div className="space-y-2.5">
                      <a
                        href={checkoutSession.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full min-h-[50px] rounded-2xl bg-[#F5A623] hover:bg-[#e59819] text-slate-950 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                      >
                        <span>Pay {formatCurrency(checkoutSession.amount, checkoutSession.currency)} on Flutterwave</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        disabled={processing}
                        onClick={() => void handleVerifyPayment()}
                        className="w-full min-h-[46px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold"
                      >
                        {processing ? 'Checking Flutterwave...' : "I've Paid — Verify Flutterwave Payment"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <button
                        type="button"
                        disabled={processing}
                        onClick={() => void handleVerifyPayment('succeed')}
                        className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{processing ? 'Verifying...' : 'Confirm & Verify VIP Membership'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onViewCampaigns}
                        className="w-full min-h-[42px] rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Go to My Campaigns
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

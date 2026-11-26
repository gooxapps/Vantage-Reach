import React, { useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import type { SiteConfig } from '../types';

export const VantageLogo: React.FC<{
  size?: number;
  logoUrl?: string;
  alt?: string;
  accentColor?: string;
}> = ({ size = 34, logoUrl, alt = 'Brand logo', accentColor = '#2563EB' }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl object-contain"
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Bold VR Monogram with Upward Arrow matching brand visual identity */}
      <path
        d="M3.5 9.5L13.5 34.5H18.5L26 14.5"
        stroke={accentColor}
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 34.5V16.5H29.5C33.5 16.5 36 18.8 36 22.1C36 25.2 33.8 27.3 30.2 27.7L36.5 34.5"
        stroke="#1D4ED8"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 23.5L32.5 5.5"
        stroke={accentColor}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M24.5 5.2H33.2V13.8"
        stroke={accentColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const BrandSplashScreen: React.FC<{
  config: SiteConfig;
  preview?: boolean;
  onSkip?: () => void;
}> = ({ config, preview = false, onSkip }) => {
  const artwork = config.splashImageUrl || config.logoUrl || config.iconUrl;
  return (
    <div
      style={{
        backgroundColor: config.splashBgColor || '#FFFFFF',
        color: config.splashTextColor || '#0F172A',
      }}
      className={
        preview
          ? 'w-full rounded-2xl border border-slate-200 p-8 flex flex-col items-center justify-center text-center min-h-[260px] transition-colors'
          : 'fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-200'
      }
    >
      <div className="flex flex-col items-center gap-4 max-w-sm">
        <div className="p-3 rounded-2xl bg-white/10">
          <VantageLogo
            size={preview ? 56 : 72}
            logoUrl={artwork}
            alt={config.splashTitle || config.appName}
            accentColor={config.splashAccentColor || config.themeColor}
          />
        </div>
        <div className="space-y-1.5">
          <h1
            className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight"
            style={{ color: config.splashTextColor || '#0F172A' }}
          >
            {config.splashTitle || config.appName}
          </h1>
          {config.splashSubtitle && (
            <p className="text-xs sm:text-sm opacity-75 leading-relaxed">
              {config.splashSubtitle}
            </p>
          )}
        </div>
        <div className="w-32 h-1 rounded-full overflow-hidden bg-slate-400/25 mt-2">
          <div
            className="h-full w-2/3 rounded-full animate-pulse"
            style={{ backgroundColor: config.splashAccentColor || config.themeColor || '#2563EB' }}
          />
        </div>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-3 min-h-[40px] px-4 rounded-xl border border-slate-300/60 text-xs font-semibold opacity-80 hover:opacity-100 transition-opacity"
          >
            {preview ? 'Close Preview' : 'Continue'}
          </button>
        )}
      </div>
    </div>
  );
};


export const PromoDiscoveryIllustration: React.FC = () => (
  <svg
    viewBox="0 0 156 108"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-full h-full max-w-[146px]"
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="vrBannerGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="vrBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.55" />
      </linearGradient>
    </defs>

    <circle cx="72" cy="54" r="52" fill="url(#vrBannerGlow)" />

    {/* Tilted Red YouTube Video Card */}
    <g transform="rotate(-9 52 46)">
      <rect x="16" y="21" width="70" height="49" rx="14" fill="#EF2B2D" />
      <rect x="16" y="21" width="70" height="49" rx="14" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="1.5" />
      <path d="M44 35.5L63 45.5L44 55.5V35.5Z" fill="#FFFFFF" />
    </g>

    {/* Ascending Analytics Bars */}
    <rect x="86" y="74" width="13" height="22" rx="4" fill="url(#vrBarGrad)" />
    <rect x="105" y="61" width="13" height="35" rx="4" fill="url(#vrBarGrad)" />
    <rect x="124" y="45" width="13" height="51" rx="4" fill="url(#vrBarGrad)" />

    {/* Curved Upward Growth Arrow */}
    <path
      d="M72 72C93 66 111 49 127 25"
      stroke="#FFFFFF"
      strokeWidth="5.5"
      strokeLinecap="round"
    />
    <path
      d="M114 25.5L129 22.5L131.5 37.5"
      stroke="#FFFFFF"
      strokeWidth="5.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const WelcomeHeroIllustration: React.FC = () => (
  <svg
    viewBox="0 0 360 220"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-full max-w-[320px] mx-auto"
    aria-hidden="true"
  >
    <ellipse cx="180" cy="186" rx="134" ry="18" fill="#EFF6FF" />
    <rect x="92" y="128" width="24" height="50" rx="6" fill="#BFDBFE" />
    <rect x="132" y="106" width="24" height="72" rx="6" fill="#93C5FD" />
    <rect x="172" y="84" width="24" height="94" rx="6" fill="#60A5FA" />
    <rect x="212" y="58" width="24" height="120" rx="6" fill="#2563EB" />
    <rect x="252" y="34" width="24" height="144" rx="6" fill="#1D4ED8" />
    <path
      d="M74 114C132 104 202 74 274 22"
      stroke="#2563EB"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M252 20L278 20L272 44"
      stroke="#2563EB"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect x="44" y="118" width="64" height="44" rx="12" fill="#DC2626" />
    <path d="M70 131L87 140L70 149V131Z" fill="#FFFFFF" />
  </svg>
);

export const ThumbnailImage: React.FC<{
  src?: string | null;
  alt: string;
  className?: string;
}> = ({ src, alt, className = 'w-full h-full object-cover' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2 text-center">
        <Video className="w-6 h-6 mb-1 text-slate-400" />
        <span className="text-[11px] font-medium text-slate-500 line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

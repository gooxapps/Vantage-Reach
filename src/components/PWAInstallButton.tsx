import React, { useState } from 'react';
import { Download, MonitorSmartphone, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useSiteConfig } from '../lib/siteConfig';

interface PWAInstallButtonProps {
  compact?: boolean;
  showFallback?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  showFallback = false,
}) => {
  const { isInstallable, isInstalled, isIOS, platformHint, install } = usePWAInstall();
  const { siteConfig } = useSiteConfig();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        return;
      }
      return;
    }
    setShowGuide(true);
  };

  const canShowButton = isInstallable || isIOS || showFallback;
  if (!canShowButton) {
    return null;
  }

  const guideTitle = isIOS
    ? 'Install on iPhone or iPad'
    : platformHint === 'android'
      ? 'Install on Android Device'
      : platformHint === 'desktop-mac'
        ? 'Install on Mac'
        : platformHint === 'desktop-windows'
          ? 'Install on Windows PC'
          : `Install ${siteConfig.appName} App`;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Install ${siteConfig.appName} App`}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap shrink-0 ${
          isInstallable
            ? 'border border-blue-200 bg-blue-50 text-[#2563EB] hover:bg-blue-100'
            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        } ${
          compact
            ? 'min-h-[40px] px-2.5 sm:px-3 text-xs'
            : 'min-h-[44px] px-4 py-2 text-sm'
        }`}
      >
        {isIOS ? (
          <Share className="w-3.5 h-3.5 shrink-0 text-[#2563EB]" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0 text-[#2563EB]" />
        )}
        <span className={compact ? 'hidden xs:inline sm:inline' : ''}>Install App</span>
        {compact && <span className="xs:hidden sm:hidden">Install</span>}
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                  {isIOS || platformHint === 'android' ? (
                    <Smartphone className="w-5 h-5" />
                  ) : (
                    <MonitorSmartphone className="w-5 h-5" />
                  )}
                </div>
                <h3 id="pwa-install-guide-title" className="text-base font-bold text-slate-900">
                  {guideTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-sm text-slate-600 leading-relaxed">
                <li>
                  1. Open this app in <strong>Safari</strong> on your iPhone or iPad.
                </li>
                <li>
                  2. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  3. Scroll down and select <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                </li>
              </ol>
            ) : platformHint === 'android' ? (
              <ol className="space-y-2.5 text-sm text-slate-600 leading-relaxed">
                <li>
                  1. Tap your browser&apos;s menu (<strong>⋮</strong>) in the top right of Chrome, Edge, or Samsung Internet.
                </li>
                <li>
                  2. Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </li>
                <li>
                  3. Confirm <strong>Install</strong> to add {siteConfig.appName} to your home screen with automatic update syncing.
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm text-slate-600 leading-relaxed">
                <li>
                  1. In <strong>Chrome</strong> or <strong>Edge</strong>, click the <strong>Install icon</strong> in the right side of the address bar (or open Browser Menu → <strong>Install {siteConfig.appName}</strong>).
                </li>
                <li>
                  2. On <strong>Mac Safari</strong>, click <strong>File → Add to Dock</strong>.
                </li>
                <li>
                  3. Open from your desktop or dock anytime—updates sync automatically whenever you&apos;re online.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

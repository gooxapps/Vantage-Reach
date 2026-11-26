import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, Mail, User as UserIcon, Globe } from 'lucide-react';
import { api, setAuthToken } from '../lib/api';
import { useSiteConfig } from '../lib/siteConfig';
import { trackAuthEvent, trackScreenView } from '../lib/visitorTracker';
import type { UserSession } from '../types';
import { VantageLogo, WelcomeHeroIllustration } from './BrandMark';
import { PWAInstallButton } from './PWAInstallButton';

type AuthScreen = 'welcome' | 'login' | 'register' | 'forgot';

interface AuthViewsProps {
  onAuthenticated: (user: UserSession) => void;
}

export const AuthViews: React.FC<AuthViewsProps> = ({ onAuthenticated }) => {
  const { siteConfig } = useSiteConfig();
  const [screen, setScreen] = useState<AuthScreen>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('United States');
  const [showPassword, setShowPassword] = useState(false);

  const [resetToken, setResetToken] = useState('');
  const [resetTokenPreview, setResetTokenPreview] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    trackScreenView(`/${screen}`, `${siteConfig.appName} · ${screen}`);
  }, [screen, siteConfig.appName]);

  const clearFeedback = () => {
    setError('');
    setNotice('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      const res = await api.post<{ user: UserSession; sessionToken?: string }>('/api/auth/login', { email, password });
      if (res.sessionToken) setAuthToken(res.sessionToken);
      trackAuthEvent('auth_login', '/dashboard');
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirm password do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ user: UserSession; sessionToken?: string }>('/api/auth/register', {
        email,
        password,
        confirmPassword,
        fullName,
        country,
      });
      if (res.sessionToken) setAuthToken(res.sessionToken);
      trackAuthEvent('auth_register', '/dashboard');
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      if (resetStep === 'request') {
        const res = await api.post<{ message: string; resetTokenPreview?: string }>('/api/auth/forgot-password', {
          email,
        });
        setNotice(res.message);
        if (res.resetTokenPreview) {
          setResetTokenPreview(res.resetTokenPreview);
          setResetToken(res.resetTokenPreview);
        }
        setResetStep('confirm');
      } else {
        const res = await api.post<{ message: string }>('/api/auth/reset-password', {
          email,
          token: resetToken,
          newPassword: password,
          confirmPassword,
        });
        setNotice(res.message);
        setResetStep('request');
        setPassword('');
        setConfirmPassword('');
        setScreen('login');
      }
    } catch (err: any) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  if (screen === 'welcome') {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between px-6 py-8 md:py-12">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VantageLogo
              size={38}
              logoUrl={siteConfig.logoUrl}
              alt={siteConfig.appName}
              accentColor={siteConfig.themeColor}
            />
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 font-display block leading-none">
                {siteConfig.appName}
              </span>
              <span className="text-xs text-slate-500">{siteConfig.companyName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => {
                clearFeedback();
                setScreen('login');
              }}
              className="min-h-[44px] px-4 py-2 text-sm font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
            >
              Sign In
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-10 items-center my-auto py-8">
          <div className="text-center lg:text-left space-y-5">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              {siteConfig.tagline}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-tight text-balance">
              {siteConfig.heroHeadline}
            </h1>
            <p className="text-base text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {siteConfig.heroDescription}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center lg:justify-start">
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setScreen('register');
                }}
                className="min-h-[48px] px-7 py-3 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setScreen('login');
                }}
                className="min-h-[48px] px-7 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                I already have an account
              </button>
            </div>
            <div className="pt-3 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" /> YouTube Data API v3
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" /> Gemini SEO Intelligence
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" /> Policy-Compliant Promotion
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-10">
            <WelcomeHeroIllustration />
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-white border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Baseline</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">Immutable</p>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 p-3">
                <p className="text-xs text-slate-500">SEO Engine</p>
                <p className="text-sm font-bold text-blue-700 mt-0.5">Gemini AI</p>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Durations</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">1 / 7 / 30d</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="max-w-5xl mx-auto w-full text-center text-xs text-slate-400">
          {siteConfig.footerText}
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          <button
            type="button"
            onClick={() => setScreen('welcome')}
            className="inline-flex items-center gap-2.5 mb-4"
          >
            <VantageLogo
              size={36}
              logoUrl={siteConfig.logoUrl}
              alt={siteConfig.appName}
              accentColor={siteConfig.themeColor}
            />
            <span className="text-lg font-bold text-slate-900 font-display">{siteConfig.appName}</span>
          </button>
          <h1 className="text-2xl font-bold text-slate-900">
            {screen === 'login' && 'Welcome Back'}
            {screen === 'register' && 'Create Creator Account'}
            {screen === 'forgot' && 'Reset Password'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {screen === 'login' && 'Sign in with your email and password to continue'}
            {screen === 'register' && 'Start tracking baseline stats and optimizing your videos'}
            {screen === 'forgot' &&
              (resetStep === 'request'
                ? 'Enter your account email to generate a reset code'
                : 'Enter your reset code and choose a new password')}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800">
            {notice}
          </div>
        )}

        {screen === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="creator@example.com"
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full min-h-[44px] pl-10 pr-11 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setResetStep('request');
                  setScreen('forgot');
                }}
                className="min-h-[40px] font-semibold text-blue-700 hover:underline"
              >
                Forgot Password?
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setScreen('register');
                }}
                className="min-h-[40px] font-semibold text-slate-700 hover:text-blue-700"
              >
                Create an Account
              </button>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 mb-2">
                Staff / Admin Evaluation Access
              </p>
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@vantagereach.global');
                  setPassword('VantageAdmin2026!');
                }}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Fill Admin Credentials (admin@vantagereach.global)
              </button>
            </div>
          </form>
        )}

        {screen === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            {!siteConfig.registrationsOpen && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                New creator registrations are currently paused by the site owner.
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Creator or channel name"
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Country</label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                >
                  <option value="United States">United States</option>
                  <option value="Nigeria">Nigeria</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Canada">Canada</option>
                  <option value="Ghana">Ghana</option>
                  <option value="South Africa">South Africa</option>
                  <option value="India">India</option>
                  <option value="Germany">Germany</option>
                  <option value="International">Other / International</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password (min 8 chars)</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full min-h-[44px] pl-10 pr-11 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label="Toggle password visibility"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setScreen('login');
                }}
                className="min-h-[40px] text-xs font-semibold text-blue-700 hover:underline"
              >
                Already registered? Sign In
              </button>
            </div>
          </form>
        )}

        {screen === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Account Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            {resetStep === 'confirm' && (
              <>
                {resetTokenPreview && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    Reset Code (Preview): <strong className="font-mono">{resetTokenPreview}</strong>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Reset Code</label>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Enter 32-char reset code"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Processing...' : resetStep === 'request' ? 'Send Reset Code' : 'Update Password'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setScreen('login');
                }}
                className="min-h-[40px] text-xs font-semibold text-slate-600 hover:text-blue-700"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

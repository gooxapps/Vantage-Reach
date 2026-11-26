export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const TOKEN_STORAGE_KEY = 'vr_session_token';
let inMemoryToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized() {
  setAuthToken(null);
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  }
}

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  let data: any = null;
  let parsedOk = false;
  if (text) {
    try {
      data = JSON.parse(text);
      parsedOk = true;
    } catch {
      data = { error: 'Server returned an unexpected response. Please try again.' };
    }
  } else {
    data = {};
    parsedOk = true;
  }

  if (!res.ok) {
    if (
      res.status === 401 &&
      path !== '/api/auth/login' &&
      path !== '/api/auth/register' &&
      path !== '/api/auth/me'
    ) {
      notifyUnauthorized();
    } else if (res.status === 401 && path === '/api/auth/me') {
      setAuthToken(null);
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code, data);
  }

  if (!parsedOk || data === null || typeof data !== 'object') {
    throw new ApiError('Unexpected server response. Please try again.', res.status || 503);
  }

  return data as T;
}

export async function downloadAuthorizedFile(path: string, filename: string) {
  const token = getAuthToken();
  const res = await fetch(path, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    if (res.status === 401) {
      notifyUnauthorized();
    }
    throw new ApiError('Failed to download report.', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
};

export function formatCount(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'Unavailable';
  return new Intl.NumberFormat('en-US').format(val);
}

export function formatCompact(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(val);
}

export function formatCurrency(amount: number | null | undefined, currency = 'USD'): string {
  const val = Number(amount || 0);
  if (currency === 'NGN') {
    return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(val)}`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

import { useAuth } from './auth-store';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function raw(path: string, init: RequestInit, token?: string | null) {
  const headers: Record<string, string> = {};
  // FormData sets its own multipart boundary header
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const { refreshToken, setTokens, clear } = useAuth.getState();
  if (!refreshToken) return false;
  const res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  if (!res.ok) {
    clear();
    return false;
  }
  setTokens(await res.json());
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init, useAuth.getState().accessToken);

  if (res.status === 401) {
    refreshing ??= tryRefresh().finally(() => (refreshing = null));
    if (await refreshing) res = await raw(path, init, useAuth.getState().accessToken);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Request failed', data?.error?.code);
  return data as T;
}

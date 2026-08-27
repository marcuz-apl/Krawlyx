// Hand-rolled typed client stub. Run `npm run gen:api` after starting the
// FastAPI backend to replace this with the real generated module from
// openapi-typescript. The stub here keeps the app buildable before the API
// exists; the production path is fully typed via OpenAPI codegen.

export type Role = 'runner' | 'admin';

export interface UserOut {
  id: number;
  username: string;
  role: Role;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: UserOut;
  csrf_token: string;
}

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
}

const BASE = '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrf = getCookie('zc_csrf');
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET' && csrf) {
    headers.set('X-CSRF-Token', csrf);
  }
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  login: (body: LoginRequest) =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  me: () => request<UserOut>('/api/auth/me'),
};

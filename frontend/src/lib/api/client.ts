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

// ---- engines ----

export interface Capabilities {
  deep_crawl: boolean;
  max_depth: number;
  max_pages_per_target: number;
  supports_wait_for: boolean;
  supports_render: boolean;
}

export interface EngineCapabilities {
  type: string;
  capabilities: Capabilities;
}

export interface CapabilityList {
  types: EngineCapabilities[];
}

export interface EngineOut {
  id: number;
  name: string;
  type: string;
  pooled: boolean;
  config_redacted: Record<string, unknown>;
  has_secret: boolean;
  disabled_at: string | null;
}

// ---- jobs ----

export interface UrlError {
  line: number;
  text: string;
  reason: string;
}

export interface JobCounts {
  pending: number;
  fetching: number;
  done: number;
  error: number;
  skipped: number;
}

export interface JobOut {
  id: number;
  engine_id: number;
  status: string;
  counts: JobCounts;
  started_at: string | null;
  finished_at: string | null;
  elapsed_s: number;
  notes: string | null;
  options: Record<string, unknown>;
  created_at: string;
}

export interface TargetOut {
  id: number;
  url: string;
  status: string;
  attempts: number;
  error: string | null;
}

export interface JobDetailOut extends JobOut {
  targets: TargetOut[];
}

export interface JobResultOut {
  id: number;
  target_id: number;
  source_url: string;
  final_url: string | null;
  http_status: number | null;
  title: string | null;
  content_markdown: string | null;
  content_text: string | null;
  links: Array<{ url: string; text: string }>;
  metadata: Record<string, unknown>;
  error: string | null;
  duration_ms: number | null;
  fetched_at: string;
}

export interface JobResultsPage {
  job_id: number;
  page: number;
  page_size: number;
  total: number;
  items: JobResultOut[];
}

export interface JobSubmitAck {
  job_id: number;
  accepted: number;
  duplicates: Array<[number, string]>;
  errors: UrlError[];
}

export interface JobCreateBody {
  engine_id: number;
  urls: string[];
  options?: Record<string, unknown>;
  notes?: string | null;
  export_target_id?: number | null;
}

// ---- export targets ----

export type ExportFormat = 'csv' | 'xlsx';
export type ExportMode = 'database' | 'folder';

export interface ExportTargetOut {
  id: number;
  name: string;
  mode: ExportMode;
  path: string | null;
  format: ExportFormat | null;
  split_size_mb: number;
  runner_selectable: boolean;
  enabled: boolean;
  created_at: string;
}

export interface ExportTargetCreateBody {
  name: string;
  mode: ExportMode;
  path?: string | null;
  format?: ExportFormat | null;
  split_size_mb?: number;
  runner_selectable?: boolean;
  enabled?: boolean;
}

export interface ExportTargetUpdateBody {
  name?: string;
  path?: string | null;
  format?: ExportFormat | null;
  split_size_mb?: number;
  runner_selectable?: boolean;
  enabled?: boolean;
}

export interface ExportTargetTestResult {
  ok: boolean;
  detail: string;
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

  engines: {
    capabilities: () => request<CapabilityList>('/api/engines/capabilities'),
    list: (params?: { pooled_only?: boolean }) => {
      const q = params?.pooled_only ? '?pooled_only=true' : '';
      return request<EngineOut[]>(`/api/engines${q}`);
    },
  },

  jobs: {
    list: (params?: { status?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.status) sp.set('status', params.status);
      if (params?.limit) sp.set('limit', String(params.limit));
      const q = sp.toString() ? `?${sp.toString()}` : '';
      return request<JobOut[]>(`/api/jobs${q}`);
    },
    create: (body: JobCreateBody) =>
      request<JobSubmitAck>('/api/jobs', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: number) => request<JobDetailOut>(`/api/jobs/${id}`),
    cancel: (id: number) =>
      request<void>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
    results: (id: number, page = 1, pageSize = 50) =>
      request<JobResultsPage>(
        `/api/jobs/${id}/results?page=${page}&page_size=${pageSize}`,
      ),
    result: (id: number, rid: number) =>
      request<JobResultOut>(`/api/jobs/${id}/results/${rid}`),
    rerun: (id: number) =>
      request<JobOut>(`/api/jobs/${id}/rerun`, { method: 'POST' }),
    /** Same-origin browser download URLs (cookie auth is automatic). */
    resultDownloadUrl: (id: number, rid: number, kind: 'md' | 'json') =>
      `/api/jobs/${id}/results/${rid}/download.${kind}`,
    exportUrl: (id: number) => `/api/jobs/${id}/export.json`,
  },

  exportTargets: {
    list: () => request<ExportTargetOut[]>('/api/export-targets'),
    create: (body: ExportTargetCreateBody) =>
      request<ExportTargetOut>('/api/export-targets', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    patch: (id: number, body: ExportTargetUpdateBody) =>
      request<ExportTargetOut>(`/api/export-targets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      request<void>(`/api/export-targets/${id}`, { method: 'DELETE' }),
    test: (id: number) =>
      request<ExportTargetTestResult>(`/api/export-targets/${id}/test`, {
        method: 'POST',
      }),
  },
};

// Hand-rolled typed client stub. Run `npm run gen:api` after starting the
// FastAPI backend to replace this with the real generated module from
// openapi-typescript. The stub here keeps the app buildable before the API
// exists; the production path is fully typed via OpenAPI codegen.

export type Role = 'runner' | 'admin' | 'superadmin';

export interface UserOut {
  id: number;
  username: string;
  role: Role;
  created_at?: string | null;
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

export interface EngineCreateBody {
  name: string;
  type: string;
  config?: Record<string, unknown>;
  pooled?: boolean;
}

export interface EngineUpdateBody {
  name?: string;
  config?: Record<string, unknown>;
  pooled?: boolean;
  disabled?: boolean;
}

export interface EngineTestResult {
  ok: boolean;
  detail: string;
  latency_ms: number;
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
  engine_name?: string | null;
  engine_type?: string | null;
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
  error?: string | null;
  session_num?: number | null;
  stagger_gap_s?: number | null;
  stagger_gap_min?: number | null;
  stagger_delay_s?: number | null;
  stagger_gap_display?: string | null;
  countdown_s?: number | null;
}

export interface JobRecordsOut {
  job_id: number;
  total_records: number;
  total_targets: number;
  columns: string[];
  records: Array<Record<string, any>>;
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

// ---- schedules ----

export interface ScheduleOut {
  id: number;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  running: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  engine_id: number;
  export_target_id: number | null;
  options: Record<string, unknown>;
  urls: string[];
  notes: string | null;
  human: string;
}

export interface ScheduleCreateBody {
  name: string;
  cron: string;
  timezone?: string;
  enabled?: boolean;
  engine_id: number;
  export_target_id?: number | null;
  urls: string[];
  options?: Record<string, unknown>;
  notes?: string | null;
}

export interface ScheduleUpdateBody {
  name?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  engine_id?: number;
  export_target_id?: number | null;
  urls?: string[];
  options?: Record<string, unknown>;
  notes?: string | null;
}

export interface NextFiresOut {
  schedule_id: number;
  cron: string;
  timezone: string;
  next_runs: string[];
  human: string;
}

// ---- users ----

export interface UserCreateBody {
  username: string;
  password: string;
  role?: Role;
}

export interface UserUpdateBody {
  password?: string;
  role?: Role;
}

// ---- datasets & merge ----

export interface DatasetOut {
  id: number;
  name: string;
  description: string | null;
  columns: string[];
  row_count: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetDetailOut extends DatasetOut {
  rows: Array<Record<string, any>>;
}

export interface CreateDatasetBody {
  name: string;
  description?: string;
  columns?: string[];
  source_job_ids?: number[];
}

export interface UpdateDatasetBody {
  name?: string;
  description?: string;
}

export interface MergeDatasetsBody {
  dataset_ids: number[];
  name: string;
  description?: string;
}

export interface MergeJobsResult {
  columns: string[];
  total_rows: number;
  rows: Array<Record<string, any>>;
  source_job_ids: number[];
}

// ---- settings ----

export interface SettingsOut {
  max_concurrent_jobs: number;
  max_parallel_targets_per_job: number;
  default_split_size_mb: number;
  robots_txt_enabled: boolean;
  per_domain_interval_s: number;
  ssrf_guard_enabled: boolean;
  content_size_cap_bytes: number;
  ssrf_allow_list?: string[];
  admin_contact_email?: string;
}

export interface SettingsUpdateBody {
  max_concurrent_jobs?: number;
  max_parallel_targets_per_job?: number;
  default_split_size_mb?: number;
  robots_txt_enabled?: boolean;
  per_domain_interval_s?: number;
  ssrf_guard_enabled?: boolean;
  content_size_cap_bytes?: number;
  ssrf_allow_list?: string[];
  admin_contact_email?: string;
}

const BASE = '';

let inMemoryCsrf: string | null = null;

export function setStoredCsrfToken(token: string | null) {
  inMemoryCsrf = token;
  if (token) {
    try {
      sessionStorage.setItem('zc_csrf', token);
    } catch {}
  } else {
    try {
      sessionStorage.removeItem('zc_csrf');
    } catch {}
  }
}

export function getStoredCsrfToken(): string | null {
  if (inMemoryCsrf) return inMemoryCsrf;
  try {
    return sessionStorage.getItem('zc_csrf');
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrf = getCookie('zc_csrf') || getStoredCsrfToken();
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET' && csrf) {
    headers.set('X-CSRF-Token', csrf);
  }
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.detail) {
        detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch {}
    throw new Error(detail || `${res.status} ${res.statusText}`);
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
  login: async (body: LoginRequest) => {
    const res = await request<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
    if (res?.csrf_token) {
      setStoredCsrfToken(res.csrf_token);
    }
    return res;
  },
  logout: async () => {
    try {
      await request<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredCsrfToken(null);
    }
  },
  me: () => request<UserOut>('/api/auth/me'),

  engines: {
    capabilities: () => request<CapabilityList>('/api/engines/capabilities'),
    list: (params?: { pooled_only?: boolean }) => {
      const q = params?.pooled_only ? '?pooled_only=true' : '';
      return request<EngineOut[]>(`/api/engines${q}`);
    },
    create: (body: EngineCreateBody) =>
      request<EngineOut>('/api/engines', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: EngineUpdateBody) =>
      request<EngineOut>(`/api/engines/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/api/engines/${id}`, { method: 'DELETE' }),
    test: (id: number) =>
      request<EngineTestResult>(`/api/engines/${id}/test`, { method: 'POST' }),
    bootstrap: () =>
      request<EngineOut[]>('/api/engines/bootstrap', { method: 'POST' }),
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
    records: (id: number) => request<JobRecordsOut>(`/api/jobs/${id}/records`),
    results: (id: number, page = 1, pageSize = 50) =>
      request<JobResultsPage>(
        `/api/jobs/${id}/results?page=${page}&page_size=${pageSize}`,
      ),
    result: (id: number, rid: number) =>
      request<JobResultOut>(`/api/jobs/${id}/results/${rid}`),
    rerun: (id: number) =>
      request<JobOut>(`/api/jobs/${id}/rerun`, { method: 'POST' }),
    merge: (job_ids: number[]) =>
      request<MergeJobsResult>('/api/jobs/merge', {
        method: 'POST',
        body: JSON.stringify({ job_ids }),
      }),
    delete: (id: number) => request<void>(`/api/jobs/${id}`, { method: 'DELETE' }),
    bulkDelete: (job_ids: number[]) =>
      request<void>('/api/jobs/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ job_ids }),
      }),
    /** Same-origin browser download URLs (cookie auth is automatic). */
    resultDownloadUrl: (id: number, rid: number, kind: 'md' | 'json') =>
      `/api/jobs/${id}/results/${rid}/download.${kind}`,
    exportUrl: (id: number) => `/api/jobs/${id}/export.json`,
    exportCsvUrl: (id: number) => `/api/jobs/${id}/export.csv`,
    exportZipUrl: (id: number) => `/api/jobs/${id}/export.zip`,
  },

  datasets: {
    list: () => request<DatasetOut[]>('/api/datasets'),
    create: (body: CreateDatasetBody) =>
      request<DatasetOut>('/api/datasets', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    patch: (id: number, body: UpdateDatasetBody) =>
      request<DatasetOut>(`/api/datasets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    merge: (body: MergeDatasetsBody) =>
      request<DatasetOut>('/api/datasets/merge', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    get: (id: number, limit = 500, offset = 0) =>
      request<DatasetDetailOut>(`/api/datasets/${id}?limit=${limit}&offset=${offset}`),
    delete: (id: number) => request<void>(`/api/datasets/${id}`, { method: 'DELETE' }),
    exportCsvUrl: (id: number) => `/api/datasets/${id}/export.csv`,
    deduplicate: (id: number) =>
      request<{ dataset_id: number; removed_count: number; remaining_count: number }>(
        `/api/datasets/${id}/deduplicate`,
        { method: 'POST' }
      ),
    executeSql: (id: number, query: string) =>
      request<{
        type: 'select' | 'mutation';
        columns?: string[];
        rows?: Array<Record<string, any>>;
        rows_affected?: number;
        remaining_count?: number;
        total_returned?: number;
      }>(`/api/datasets/${id}/sql`, {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
    executeRawSql: (query: string, rows: Array<Record<string, any>>) =>
      request<{
        type: 'select' | 'mutation';
        columns?: string[];
        rows?: Array<Record<string, any>>;
        rows_affected?: number;
        remaining_count?: number;
        total_returned?: number;
      }>(`/api/datasets/sql-exec`, {
        method: 'POST',
        body: JSON.stringify({ query, rows }),
      }),
    split: (id: number, attribute: string = 'make') =>
      request<{
        source_dataset_id: number;
        source_dataset_name: string;
        attribute: string;
        created_datasets: Array<{
          key: string;
          dataset_id: number;
          name: string;
          row_count: number;
        }>;
        total_rows_split: number;
      }>(`/api/datasets/${id}/split`, {
        method: 'POST',
        body: JSON.stringify({ attribute }),
      }),
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

  schedules: {
    list: () => request<ScheduleOut[]>('/api/schedules'),
    create: (body: ScheduleCreateBody) =>
      request<ScheduleOut>('/api/schedules', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    get: (id: number) => request<ScheduleOut>(`/api/schedules/${id}`),
    patch: (id: number, body: ScheduleUpdateBody) =>
      request<ScheduleOut>(`/api/schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      request<void>(`/api/schedules/${id}`, { method: 'DELETE' }),
    runNow: (id: number) =>
      request<JobOut>(`/api/schedules/${id}/run-now`, { method: 'POST' }),
    nextFires: (id: number) =>
      request<NextFiresOut>(`/api/schedules/${id}/next-fires`),
  },

  users: {
    list: () => request<UserOut[]>('/api/users'),
    create: (body: UserCreateBody) =>
      request<UserOut>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: UserUpdateBody) =>
      request<UserOut>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  },


  database: {
    tables: () => request<Array<{
      name: string;
      type: string;
      row_count: number;
      column_count: number;
      columns: Array<{
        cid: number;
        name: string;
        type: string;
        notnull: boolean;
        dflt_value: any;
        pk: boolean;
      }>;
      sql: string;
    }>>('/api/database/tables'),

    tableRows: (tableName: string, params?: {
      page?: number;
      page_size?: number;
      sort_col?: string | null;
      sort_dir?: 'asc' | 'desc';
      search?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params?.page) sp.set('page', String(params.page));
      if (params?.page_size) sp.set('page_size', String(params.page_size));
      if (params?.sort_col) sp.set('sort_col', params.sort_col);
      if (params?.sort_dir) sp.set('sort_dir', params.sort_dir);
      if (params?.search) sp.set('search', params.search);
      const q = sp.toString() ? `?${sp.toString()}` : '';
      return request<{
        table_name: string;
        total_rows: number;
        filtered_rows: number;
        page: number;
        page_size: number;
        total_pages: number;
        columns: Array<{ name: string; type: string; pk: boolean }>;
        rows: Array<Record<string, any>>;
      }>(`/api/database/tables/${encodeURIComponent(tableName)}/rows${q}`);
    },

    query: (sql: string) =>
      request<{
        success: boolean;
        columns?: string[];
        rows?: Array<Record<string, any>>;
        row_count?: number;
        rows_affected?: number;
        duration_ms?: number;
        is_read_only?: boolean;
        error?: string;
      }>('/api/database/query', {
        method: 'POST',
        body: JSON.stringify({ sql }),
      }),

    stats: () =>
      request<{
        db_path: string;
        file_size_bytes: number;
        file_size_formatted: string;
        wal_size_bytes: number;
        wal_size_formatted: string;
        page_size: number;
        page_count: number;
        freelist_count: number;
        schema_version: number;
        integrity_status: string;
        integrity_ok: boolean;
      }>('/api/database/stats'),

    maintenance: (action: 'vacuum' | 'checkpoint' | 'optimize' | 'integrity_check') =>
      request<{
        success: boolean;
        action: string;
        message: string;
        stats: {
          db_path: string;
          file_size_bytes: number;
          file_size_formatted: string;
          wal_size_bytes: number;
          wal_size_formatted: string;
          page_size: number;
          page_count: number;
          freelist_count: number;
          schema_version: number;
          integrity_status: string;
          integrity_ok: boolean;
        };
      }>('/api/database/maintenance', {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
  },
  settings: {
    get: () => request<SettingsOut>('/api/settings'),
    update: (body: SettingsUpdateBody) =>
      request<SettingsOut>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    getDbStats: () =>
      request<{
        db_path: string;
        db_size_bytes: number;
        db_size_formatted: string;
        wal_size_bytes: number;
        wal_size_formatted: string;
        journal_mode: string;
        page_count: number;
        page_size: number;
        total_datasets: number;
        total_dataset_rows: number;
        total_jobs: number;
        total_job_results: number;
      }>('/api/settings/db/stats'),
    runCheckpoint: () =>
      request<{
        action: string;
        success: boolean;
        message: string;
        before_size_bytes: number;
        after_size_bytes: number;
        before_size_formatted: string;
        after_size_formatted: string;
        bytes_freed: number;
      }>('/api/settings/db/checkpoint', { method: 'POST' }),
    runVacuum: () =>
      request<{
        action: string;
        success: boolean;
        message: string;
        before_size_bytes: number;
        after_size_bytes: number;
        before_size_formatted: string;
        after_size_formatted: string;
        bytes_freed: number;
      }>('/api/settings/db/vacuum', { method: 'POST' }),
  },
};

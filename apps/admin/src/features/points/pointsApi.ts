import type { PointReason, StudentOption } from '@jshsus/types';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
};

export type PointRiskStatus = 'normal' | 'risk' | 'departure';
export type SortOrder = 'asc' | 'desc';

export type PointStudentRow = StudentOption & {
  meritPoint: number;
  penaltyPoint: number;
  isDepartureCandidate: boolean;
  riskStatus: PointRiskStatus;
};

export type PointRecordRow = {
  id: number;
  studentId: number;
  studentNo: number;
  studentName: string;
  teacherName: string;
  reasonId: number;
  reason: string;
  reasonType: PointReason['type'];
  point: number;
  baseDate: string;
  createdAt: string;
  canceledAt?: string;
  restoredAt?: string;
  isSystemGenerated: boolean;
};

export type PointReasonRow = PointReason & { isSystem: boolean };

export type DepartureCandidate = {
  id: number;
  studentNo: number;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  currentPoint: number;
  meritPoint: number;
  penaltyPoint: number;
  riskStatus: 'risk' | 'departure';
  caseId?: number;
  caseStatus?: 'pending' | 'processing' | 'completed' | 'dismissed';
  handledBy?: string;
  handledAt?: string;
  memo?: string;
};

export type DepartureHistoryRow = {
  id: number;
  studentId: number;
  studentNo: number;
  name: string;
  handledBy?: string;
  handledAt?: string;
  memo?: string;
};

export type PointImportPreviewRow = {
  rowNumber: number;
  studentId?: number;
  studentNo: number;
  studentName?: string;
  reasonId: number;
  reason: string;
  point: number;
  baseDate: string;
  errors: string[];
};

export type PointImportPreview = {
  valid: boolean;
  validCount: number;
  errorCount: number;
  rows: PointImportPreviewRow[];
};

export type SemesterHalfPreviewItem = {
  studentId: number;
  studentNo: number;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  currentPoint: number;
  afterPoint: number;
  meritBefore: number;
  meritAfter: number;
  meritAdjustment: number;
  penaltyBefore: number;
  penaltyAfter: number;
  penaltyAdjustment: number;
};

export type SemesterHalfPreview = {
  operationId: string;
  alreadyApplied: boolean;
  adjustedStudentCount: number;
  recordCount: number;
  items: SemesterHalfPreviewItem[];
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

let csrfToken: string | null = null;

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('보안 토큰을 불러오지 못했습니다.');
  const body = (await response.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: HeadersInit = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = await getCsrfToken();
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? '요청을 처리하지 못했습니다.');
  }
  return response.json() as Promise<T>;
}

function withQuery(path: string, query: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return `${path}?${search.toString()}`;
}

export const pointsApi = {
  students: (query: {
    page: number;
    pageSize: number;
    search?: string;
    grade?: number;
    classNo?: number;
    number?: number;
    riskStatus?: PointRiskStatus;
    watchOnly?: boolean;
    sortBy?: 'studentNo' | 'name' | 'meritPoint' | 'penaltyPoint';
    sortOrder?: SortOrder;
  }) => request<PageResult<PointStudentRow>>(withQuery('/api/admin/points/students/page', query)),
  records: (query: {
    page: number;
    pageSize: number;
    search?: string;
    type?: PointReason['type'];
    from?: string;
    to?: string;
    sortBy?:
      'baseDate' | 'createdAt' | 'studentNo' | 'studentName' | 'reasonId' | 'point' | 'teacherName';
    sortOrder?: SortOrder;
  }) => request<PageResult<PointRecordRow>>(withQuery('/api/admin/points/records/page', query)),
  createRecordBatch: (body: {
    idempotencyKey: string;
    records: Array<{
      studentId: number;
      reasonId: number;
      point: number;
      reasonText: string;
      baseDate: string;
    }>;
  }) =>
    request<{ ok: true; replayed: boolean; recordIds: number[] }>(
      '/api/admin/points/records/batch',
      { method: 'POST', body },
    ),
  previewRecordImport: (body: {
    rows: Array<{
      rowNumber: number;
      studentNo: number;
      reasonId: number;
      point: number;
      reasonText: string;
      baseDate: string;
    }>;
  }) =>
    request<PointImportPreview>('/api/admin/points/records/import-preview', {
      method: 'POST',
      body,
    }),
  cancelRecord: (id: number, reason: string) =>
    request<{ ok: true }>(`/api/admin/points/records/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  restoreRecord: (id: number, reason: string) =>
    request<{ ok: true }>(`/api/admin/points/records/${id}/restore`, {
      method: 'POST',
      body: { reason },
    }),
  reasons: () => request<PointReason[]>('/api/admin/points/reasons'),
  reasonPage: (query: {
    page: number;
    pageSize: number;
    search?: string;
    type?: PointReason['type'];
    sortBy?: 'id' | 'point';
    sortOrder?: SortOrder;
  }) => request<PageResult<PointReasonRow>>(withQuery('/api/admin/points/reasons/page', query)),
  createReason: (body: Pick<PointReason, 'type' | 'point' | 'comment'>) =>
    request<{ ok: true }>('/api/admin/points/reasons', { method: 'POST', body }),
  updateReason: (id: number, body: Partial<Omit<PointReason, 'id'>>) =>
    request<{ ok: true }>(`/api/admin/points/reasons/${id}`, { method: 'PATCH', body }),
  departureCandidates: (query: {
    page: number;
    pageSize: number;
    search?: string;
    grade?: number;
    classNo?: number;
    riskStatus?: 'risk' | 'departure' | 'all';
    sortBy?: 'studentNo' | 'name' | 'meritPoint' | 'penaltyPoint' | 'currentPoint';
    sortOrder?: SortOrder;
  }) =>
    request<PageResult<DepartureCandidate>>(
      withQuery('/api/admin/points/departure-candidates/page', query),
    ),
  departureHistory: (query: {
    page: number;
    pageSize: number;
    search?: string;
    grade?: number;
    classNo?: number;
    sortBy?: 'studentNo' | 'name' | 'handledAt';
    sortOrder?: SortOrder;
  }) =>
    request<PageResult<DepartureHistoryRow>>(
      withQuery('/api/admin/points/departure-history/page', query),
    ),
  approveDeparture: (studentId: number, body: { memo: string; baseDate: string }) =>
    request<{ ok: true; adjustment: number }>(`/api/admin/points/departures/${studentId}/approve`, {
      method: 'POST',
      body,
    }),
  previewSemesterHalf: (body: { schoolYear: number; semester: number; baseDate: string }) =>
    request<SemesterHalfPreview>('/api/admin/points/semester-half/preview', {
      method: 'POST',
      body,
    }),
  applySemesterHalf: (body: { schoolYear: number; semester: number; baseDate: string }) =>
    request<{ ok: true; replayed: boolean; adjustedStudentCount: number; recordCount: number }>(
      '/api/admin/points/semester-half',
      { method: 'POST', body },
    ),
};

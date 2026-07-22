import type {
  AccountActivationIdentityType,
  AccountActivationIssueResult,
  AcademicEvent,
  ActivityRequestAdminListQuery,
  ActivityRequestAdminSummary,
  ActivityRequestPrintBatch,
  ActivityRequestStudentOption,
  ActivityRequestTeacherOption,
  ActivityTimeSlotId,
  AdminAuditLog,
  AdminAuditLogListQuery,
  AdminDashboard,
  AdminIdentityListQuery,
  AdminPermissionSummary,
  AdminRoleSummary,
  AdminSchoolYearSummary,
  AdminStaffSummary,
  AdminStudentSummary,
  AdminSystemStatus,
  BoardCommentSummary,
  BoardPostSummary,
  ContentReportSummary,
  DeviceCase,
  DeviceCaseCommand,
  DeviceCaseCommandResult,
  DeviceCaseControlCommand,
  DormAssignment,
  DormDrawPreview,
  DormReport,
  DormReportStatus,
  DormRoom,
  DormRoommateBlock,
  DormStudentOption,
  PaginatedResponse,
  PointReason,
  PointSummary,
  RosterImportApplyResult,
  RosterImportPreview,
  RosterImportRowInput,
  SessionUser,
  StudentOption,
  LostItemSummary,
  ManagedSchoolEvent,
  NoticeSummary,
  UploadedFileSummary,
} from '@jshsus/types';

let csrfTokenCache: string | null = null;

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export function describeAdminApiError(error: unknown, resource: string) {
  if (error instanceof AdminApiError) {
    if (error.status === 401) return '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.';
    if (error.status === 403) return `${resource}을(를) 조회할 권한이 없습니다.`;
    if (error.status && error.status >= 500) {
      return `${resource}을(를) 처리하는 서버에서 오류가 발생했습니다.`;
    }
  }
  return `${resource}을(를) 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  csrf?: boolean;
};

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  code?: string;
};

export type AdminLoginResponse =
  | {
      status: 'AUTHENTICATED';
      session: Extract<SessionUser, { isLogined: true }>;
    }
  | {
      status: 'NEW_PASSWORD_REQUIRED';
      flowId: string;
    };

export type AdminAuthenticatedResponse = Extract<AdminLoginResponse, { status: 'AUTHENTICATED' }>;

export type SchoolEventInput = Omit<ManagedSchoolEvent, 'id'>;

export type AdminSchoolCalendarEvent = AcademicEvent & {
  managedId?: number;
  editable: boolean;
  isPublic: boolean;
};

export type AdminSchoolCalendar = {
  from: string;
  to: string;
  events: AdminSchoolCalendarEvent[];
  availability: 'available' | 'partial' | 'unavailable';
  homepageAvailable: boolean;
  schoolEventsAvailable: boolean;
};

async function getCsrfToken() {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new AdminApiError('CSRF request failed', response.status);
  }

  const data = (await response.json()) as { csrfToken: string };
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: HeadersInit = { accept: 'application/json' };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && options.csrf !== false) {
    headers['x-csrf-token'] = await getCsrfToken();
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const payload = await response
      .json()
      .then((value) => value as ApiErrorPayload)
      .catch(() => null);
    const payloadMessage = Array.isArray(payload?.message)
      ? payload.message.join(' ')
      : payload?.message;
    throw new AdminApiError(
      payloadMessage || payload?.error || 'Request failed',
      response.status,
      payload?.code,
    );
  }

  return response.json() as Promise<T>;
}

function withQuery(path: string, query: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'x-csrf-token': await getCsrfToken(),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new AdminApiError('Upload failed', response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  session: () => request<SessionUser>('/api/auth/session'),
  login: (input: { username: string; password: string; remember: boolean }) =>
    request<AdminLoginResponse>('/api/auth/login', {
      method: 'POST',
      body: input,
      csrf: false,
    }).then((result) => {
      csrfTokenCache = null;
      return result;
    }),
  completeNewPassword: (input: { flowId: string; newPassword: string }) =>
    request<AdminAuthenticatedResponse>('/api/auth/challenges/new-password', {
      method: 'POST',
      body: input,
      csrf: false,
    }).then((result) => {
      csrfTokenCache = null;
      return result;
    }),
  requestPasswordReset: (input: { username: string }) =>
    request<{ ok: true }>('/api/auth/password/forgot', {
      method: 'POST',
      body: input,
      csrf: false,
    }),
  confirmPasswordReset: (input: { username: string; code: string; newPassword: string }) =>
    request<{ ok: true }>('/api/auth/password/confirm', {
      method: 'POST',
      body: input,
      csrf: false,
    }).then((result) => {
      csrfTokenCache = null;
      return result;
    }),
  logout: () =>
    request<{ ok: true }>('/api/auth/logout', { method: 'POST' }).then((result) => {
      csrfTokenCache = null;
      return result;
    }),
  dashboard: () => request<AdminDashboard>('/api/admin/dashboard'),
  systemStatus: () => request<AdminSystemStatus>('/api/admin/system-status'),
  auditLogs: (query: AdminAuditLogListQuery = {}) =>
    request<PaginatedResponse<AdminAuditLog>>(withQuery('/api/admin/audit-logs', { ...query })),
  adminStudents: (query: AdminIdentityListQuery = {}) =>
    request<PaginatedResponse<AdminStudentSummary>>(withQuery('/api/admin/students', { ...query })),
  schoolYears: () => request<AdminSchoolYearSummary[]>('/api/admin/school-years'),
  createStudent: (input: {
    studentNo: number;
    name: string;
    gender: 'male' | 'female';
    email?: string;
    phone?: string;
  }) =>
    request<{ ok: true; studentId: number; userId: number }>('/api/admin/students', {
      method: 'POST',
      body: input,
    }),
  updateStudent: (
    id: number,
    input: Partial<{
      studentNo: number;
      name: string;
      gender: 'male' | 'female';
      email: string;
      phone: string;
    }>,
  ) =>
    request<{ ok: true; id: number }>(`/api/admin/students/${id}`, { method: 'PUT', body: input }),
  previewStudentRoster: (input: {
    schoolYear: number;
    fileName?: string;
    rows: RosterImportRowInput[];
    activateYear?: boolean;
  }) =>
    request<RosterImportPreview>('/api/admin/students/roster/preview', {
      method: 'POST',
      body: input,
    }),
  applyStudentRoster: (input: {
    schoolYear: number;
    fileName?: string;
    rows: RosterImportRowInput[];
    activateYear?: boolean;
  }) =>
    request<RosterImportApplyResult>('/api/admin/students/roster/apply', {
      method: 'POST',
      body: input,
    }),
  adminStaff: (query: AdminIdentityListQuery = {}) =>
    request<PaginatedResponse<AdminStaffSummary>>(withQuery('/api/admin/staff', { ...query })),
  createStaff: (input: { name: string; email?: string; phone?: string }) =>
    request<{ ok: true; staffId: number; userId: number; staffNo: number }>('/api/admin/staff', {
      method: 'POST',
      body: input,
    }),
  updateStaff: (
    id: number,
    input: Partial<{
      name: string;
      email: string;
      phone: string;
    }>,
  ) => request<{ ok: true; id: number }>(`/api/admin/staff/${id}`, { method: 'PUT', body: input }),
  issueAccountActivation: (input: {
    identityType: AccountActivationIdentityType;
    identityNumber: number;
  }) =>
    request<AccountActivationIssueResult>('/api/admin/account-activations', {
      method: 'POST',
      body: input,
    }),
  iamRoles: () => request<AdminRoleSummary[]>('/api/admin/iam/roles'),
  createRole: (input: { name: string; label: string }) =>
    request<{ ok: true; role: AdminRoleSummary }>('/api/admin/iam/roles', {
      method: 'POST',
      body: input,
    }),
  updateRole: (id: number, input: { name?: string; label?: string }) =>
    request<{ ok: true; id: number }>(`/api/admin/iam/roles/${id}`, { method: 'PUT', body: input }),
  iamPermissions: () => request<AdminPermissionSummary[]>('/api/admin/iam/permissions'),
  userRoles: (userId: number) => request<number[]>(`/api/admin/users/${userId}/roles`),
  assignUserRoles: (userId: number, ids: number[]) =>
    request<{ ok: true; userId: number; roleIds: number[] }>(`/api/admin/users/${userId}/roles`, {
      method: 'PUT',
      body: { ids },
    }),
  rolePermissions: (roleId: number) =>
    request<number[]>(`/api/admin/iam/roles/${roleId}/permissions`),
  assignRolePermissions: (roleId: number, ids: number[]) =>
    request<{ ok: true; roleId: number; permissionIds: number[] }>(
      `/api/admin/iam/roles/${roleId}/permissions`,
      { method: 'PUT', body: { ids } },
    ),
  notices: () => request<NoticeSummary[]>('/api/admin/notices'),
  createNotice: (input: { title: string; content: string; department: string; pinned: boolean }) =>
    request<{ ok: true; notice: { id: number } }>('/api/admin/notices', {
      method: 'POST',
      body: input,
    }),
  updateNotice: (
    id: number,
    input: { title?: string; content?: string; department?: string; pinned?: boolean },
  ) =>
    request<{ ok: true; id: number }>(`/api/admin/notices/${id}`, { method: 'PUT', body: input }),
  deleteNotice: (id: number) =>
    request<{ ok: true; id: number }>(`/api/admin/notices/${id}`, { method: 'DELETE' }),
  schoolEvents: (range: { from: string; to: string }) => {
    const search = new URLSearchParams(range);
    return request<ManagedSchoolEvent[]>(`/api/admin/school-events?${search.toString()}`);
  },
  schoolCalendar: (range: { from: string; to: string }) => {
    const search = new URLSearchParams(range);
    return request<AdminSchoolCalendar>(`/api/admin/school-calendar?${search.toString()}`);
  },
  createSchoolEvent: (input: SchoolEventInput) =>
    request<ManagedSchoolEvent>('/api/admin/school-events', {
      method: 'POST',
      body: input,
    }),
  updateSchoolEvent: (id: number, input: Partial<SchoolEventInput>) =>
    request<ManagedSchoolEvent>(`/api/admin/school-events/${id}`, {
      method: 'PUT',
      body: input,
    }),
  deleteSchoolEvent: (id: number) =>
    request<{ ok: true; id: number }>(`/api/admin/school-events/${id}`, {
      method: 'DELETE',
    }),
  boardPosts: () => request<BoardPostSummary[]>('/api/admin/boards/free/posts'),
  boardComments: (postId: number) =>
    request<BoardCommentSummary[]>(`/api/admin/boards/free/posts/${postId}/comments`),
  updatePostHidden: (id: number, isHidden: boolean) =>
    request<{ ok: true; id: number; isHidden: boolean }>(`/api/admin/boards/posts/${id}/hidden`, {
      method: 'PUT',
      body: { isHidden },
    }),
  updateCommentHidden: (id: number, isHidden: boolean) =>
    request<{ ok: true; id: number; isHidden: boolean }>(
      `/api/admin/boards/comments/${id}/hidden`,
      {
        method: 'PUT',
        body: { isHidden },
      },
    ),
  reports: () => request<ContentReportSummary[]>('/api/admin/reports'),
  updateReportStatus: (id: number, status: string) =>
    request<{ ok: true; id: number; status: string }>(`/api/admin/reports/${id}/status`, {
      method: 'PUT',
      body: { status },
    }),
  lostItems: () => request<LostItemSummary[]>('/api/admin/lost-items'),
  updateLostItemStatus: (id: number, status: LostItemSummary['status']) =>
    request<{ ok: true; id: number; status: LostItemSummary['status'] }>(
      `/api/admin/lost-items/${id}/status`,
      {
        method: 'PUT',
        body: { status },
      },
    ),
  deleteLostItem: (id: number) =>
    request<{ ok: true; id: number; cleanupPending: boolean }>(`/api/admin/lost-items/${id}`, {
      method: 'DELETE',
    }),
  uploadFile: async (input: {
    file: File;
    targetType: string;
    targetId: number;
    visibility?: UploadedFileSummary['visibility'];
  }) => {
    const formData = new FormData();
    formData.set('file', input.file);
    formData.set('targetType', input.targetType);
    formData.set('targetId', String(input.targetId));
    formData.set('visibility', input.visibility ?? 'private');
    return uploadRequest<{ ok: true; file: UploadedFileSummary }>('/api/files', formData);
  },
  pointSummary: () => request<PointSummary>('/api/admin/points/summary'),
  pointReasons: () => request<PointReason[]>('/api/admin/points/reasons'),
  pointStudents: () => request<StudentOption[]>('/api/admin/points/students'),
  createPointRecord: (input: {
    studentId: number;
    reasonId: number;
    point: number;
    reasonText: string;
    baseDate: string;
  }) => request<{ ok: true }>('/api/admin/points/records', { method: 'POST', body: input }),
  cancelPointRecord: (id: number, reason: string) =>
    request<{ ok: true }>(`/api/admin/points/records/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  createPointReason: (input: { type: PointReason['type']; point: number; comment: string }) =>
    request<{ ok: true }>('/api/admin/points/reasons', { method: 'POST', body: input }),
  deviceCases: () => request<DeviceCase[]>('/api/admin/device-cases'),
  deviceCaseCommands: (id: number) =>
    request<DeviceCaseCommand[]>(`/api/admin/device-cases/${id}/commands`),
  deviceCaseCommand: (id: number, command: DeviceCaseControlCommand) =>
    request<DeviceCaseCommandResult>(`/api/admin/device-cases/${id}/commands`, {
      method: 'POST',
      body: { command },
    }),
  deviceCaseBulkCommand: (input: { command: DeviceCaseControlCommand; ids?: number[] }) =>
    request<DeviceCaseCommandResult>('/api/admin/device-cases/commands', {
      method: 'POST',
      body: input,
    }),
  dormRooms: (query: {
    year: number;
    semester: number;
    search?: string;
    dormName?: string;
    grade?: number;
  }) => request<DormRoom[]>(withQuery('/api/admin/dorm/rooms', query)),
  dormStudents: (query: { year: number; semester: number }) =>
    request<DormStudentOption[]>(withQuery('/api/admin/dorm/students', query)),
  dormAssignments: (query: { year: number; semester: number }) =>
    request<DormAssignment[]>(withQuery('/api/admin/dorm/assignments', query)),
  dormReports: () => request<DormReport[]>('/api/admin/dorm/reports'),
  dormRoommateBlocks: (query: { year: number; semester: number }) =>
    request<DormRoommateBlock[]>(withQuery('/api/admin/dorm/roommate-blocks', query)),
  createDormAssignment: (input: {
    roomId: number;
    userId: number;
    year: number;
    semester: number;
    bedPosition: number;
  }) => request<{ ok: true }>('/api/admin/dorm/assignments', { method: 'POST', body: input }),
  moveDormAssignment: (id: number, input: { roomId: number; bedPosition: number }) =>
    request<{ ok: true; id: number }>(`/api/admin/dorm/assignments/${id}`, {
      method: 'PUT',
      body: input,
    }),
  swapDormAssignments: (input: { leftAssignmentId: number; rightAssignmentId: number }) =>
    request<{ ok: true }>('/api/admin/dorm/assignments/swap', { method: 'POST', body: input }),
  cancelDormAssignment: (id: number) =>
    request<{ ok: true }>(`/api/admin/dorm/assignments/${id}`, { method: 'DELETE' }),
  createDormRoommateBlock: (input: {
    studentUserId: number;
    blockedUserId: number;
    year: number;
    semester: number;
  }) => request<{ ok: true }>('/api/admin/dorm/roommate-blocks', { method: 'POST', body: input }),
  deleteDormRoommateBlock: (id: number) =>
    request<{ ok: true }>(`/api/admin/dorm/roommate-blocks/${id}`, { method: 'DELETE' }),
  previewDormDraw: (input: {
    year: number;
    semester: number;
    dormName?: DormRoom['dormName'];
    grade?: number;
    studentIds?: number[];
    seed?: number;
  }) => request<DormDrawPreview>('/api/admin/dorm/draw/preview', { method: 'POST', body: input }),
  applyDormDraw: (input: {
    year: number;
    semester: number;
    targetUserIds: number[];
    placements: Array<{ userId: number; roomId: number; bedPosition: number }>;
  }) =>
    request<{ ok: true; assignmentCount: number; unassignedCount: number }>(
      '/api/admin/dorm/draw/apply',
      {
        method: 'POST',
        body: input,
      },
    ),
  updateDormReportStatus: (id: number, input: { status: DormReportStatus; comment?: string }) =>
    request<{ ok: true; id: number; status: DormReportStatus }>(
      `/api/admin/dorm/reports/${id}/status`,
      {
        method: 'PUT',
        body: input,
      },
    ),
  activityRequests: (query: ActivityRequestAdminListQuery = {}) =>
    request<PaginatedResponse<ActivityRequestAdminSummary>>(
      withQuery('/api/admin/activity-requests', query),
    ),
  activityRequestStudents: () =>
    request<ActivityRequestStudentOption[]>('/api/admin/activity-requests/students'),
  activityRequestTeachers: () =>
    request<ActivityRequestTeacherOption[]>('/api/admin/activity-requests/teachers'),
  createActivityRequest: (input: {
    representativeStudentNo: number;
    participantStudentNos: number[];
    location: string;
    activitySlotIds: ActivityTimeSlotId[];
    startsAt: string;
    endsAt: string;
    purpose: string;
  }) =>
    request<{
      ok: true;
      request: { id: number; status: 'approved'; issuedNumber: string };
    }>('/api/admin/activity-requests', { method: 'POST', body: input }),
  approveActivityRequest: (id: number) =>
    request<{ ok: true; id: number; status: 'approved'; issuedNumber: string }>(
      `/api/admin/activity-requests/${id}/approve`,
      { method: 'POST' },
    ),
  rejectActivityRequest: (id: number, reason: string) =>
    request<{ ok: true; id: number; status: 'rejected'; rejectionReason: string }>(
      `/api/admin/activity-requests/${id}/reject`,
      {
        method: 'POST',
        body: { reason },
      },
    ),
  printTodayActivityRequests: (date?: string) =>
    request<ActivityRequestPrintBatch>('/api/admin/activity-requests/print/today', {
      method: 'POST',
      body: date ? { date } : {},
    }),
};

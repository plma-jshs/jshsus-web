import type {
  ActivityRequestSummary,
  AdminAuditLog,
  AdminDashboard,
  AdminPermissionSummary,
  AdminRoleSummary,
  AdminStaffSummary,
  AdminStudentSummary,
  BoardCommentSummary,
  BoardPostSummary,
  ContentReportSummary,
  DeviceCase,
  DeviceCaseCommand,
  DormAssignment,
  DormReport,
  DormReportStatus,
  DormRoom,
  DormStudentOption,
  PetitionSummary,
  PointReason,
  PointSummary,
  SessionUser,
  StudentOption,
  UserRole,
  LostItemSummary,
  NoticeSummary,
  UploadedFileSummary,
} from '@jshsus/types';

let csrfTokenCache: string | null = null;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
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
    throw new Error(`CSRF request failed: ${response.status}`);
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

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/api/auth/login') {
    headers['x-csrf-token'] = await getCsrfToken();
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
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
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  session: () => request<SessionUser>('/api/auth/session'),
  login: (input: { username: string; password: string; role: UserRole }) =>
    request<Extract<SessionUser, { isLogined: true }>>('/api/auth/login', {
      method: 'POST',
      body: input,
    }).then((session) => {
      csrfTokenCache = null;
      return session;
    }),
  logout: () =>
    request<{ ok: true }>('/api/auth/logout', { method: 'POST' }).then((result) => {
      csrfTokenCache = null;
      return result;
    }),
  dashboard: () => request<AdminDashboard>('/api/admin/dashboard'),
  auditLogs: () => request<AdminAuditLog[]>('/api/admin/audit-logs'),
  adminStudents: () => request<AdminStudentSummary[]>('/api/admin/students'),
  createStudent: (
    input: Omit<AdminStudentSummary, 'id' | 'currentPoint' | 'userId'> & {
      initialPassword: string;
      email?: string;
      phone?: string;
    },
  ) =>
    request<{ ok: true; studentId: number; userId: number }>('/api/admin/students', {
      method: 'POST',
      body: input,
    }),
  updateStudent: (
    id: number,
    input: Partial<Omit<AdminStudentSummary, 'id' | 'currentPoint' | 'userId'>>,
  ) =>
    request<{ ok: true; id: number }>(`/api/admin/students/${id}`, { method: 'PUT', body: input }),
  adminStaff: () => request<AdminStaffSummary[]>('/api/admin/staff'),
  createStaff: (
    input: Omit<AdminStaffSummary, 'id' | 'userId'> & {
      initialPassword: string;
      email?: string;
      phone?: string;
    },
  ) =>
    request<{ ok: true; staffId: number; userId: number }>('/api/admin/staff', {
      method: 'POST',
      body: input,
    }),
  updateStaff: (id: number, input: Partial<Omit<AdminStaffSummary, 'id' | 'userId'>>) =>
    request<{ ok: true; id: number }>(`/api/admin/staff/${id}`, { method: 'PUT', body: input }),
  iamRoles: () => request<AdminRoleSummary[]>('/api/admin/iam/roles'),
  createRole: (input: { name: string; label: string }) =>
    request<{ ok: true; role: AdminRoleSummary }>('/api/admin/iam/roles', {
      method: 'POST',
      body: input,
    }),
  updateRole: (id: number, input: { name?: string; label?: string }) =>
    request<{ ok: true; id: number }>(`/api/admin/iam/roles/${id}`, { method: 'PUT', body: input }),
  iamPermissions: () => request<AdminPermissionSummary[]>('/api/admin/iam/permissions'),
  createPermission: (input: { name: string; label: string; description?: string }) =>
    request<{ ok: true; permission: AdminPermissionSummary }>('/api/admin/iam/permissions', {
      method: 'POST',
      body: input,
    }),
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
    comment: string;
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
  dormRooms: () => request<DormRoom[]>('/api/admin/dorm/rooms'),
  dormStudents: () => request<DormStudentOption[]>('/api/admin/dorm/students'),
  dormAssignments: () => request<DormAssignment[]>('/api/admin/dorm/assignments'),
  dormReports: () => request<DormReport[]>('/api/admin/dorm/reports'),
  createDormAssignment: (input: {
    roomId: number;
    userId: number;
    year: number;
    semester: number;
    bedPosition: number;
  }) => request<{ ok: true }>('/api/admin/dorm/assignments', { method: 'POST', body: input }),
  updateDormReportStatus: (id: number, input: { status: DormReportStatus; comment?: string }) =>
    request<{ ok: true; id: number; status: DormReportStatus }>(
      `/api/admin/dorm/reports/${id}/status`,
      {
        method: 'PUT',
        body: input,
      },
    ),
  activityRequests: () => request<ActivityRequestSummary[]>('/api/admin/activity-requests'),
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
  markActivityRequestPrinted: (id: number) =>
    request<{ ok: true; id: number }>(`/api/admin/activity-requests/${id}/print`, {
      method: 'POST',
    }),
  petitions: () => request<PetitionSummary[]>('/api/petitions'),
  answerPetition: (id: number, content: string) =>
    request<{ ok: true; id: number; answer: { id: number; content: string } }>(
      `/api/admin/petitions/${id}/answer`,
      {
        method: 'POST',
        body: { content },
      },
    ),
};

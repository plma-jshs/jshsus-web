import { useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type {
  AdminIdentityListQuery,
  AdminStaffSummary,
  AdminStudentSummary,
  StudentGender,
} from '@jshsus/types';
import { KeyRound, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Dialog,
  IconButton,
  PageSizeSelect,
  SegmentedTabs,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import './users.css';

type Tab = 'students' | 'staff';
type Identity =
  { kind: 'student'; value: AdminStudentSummary } | { kind: 'staff'; value: AdminStaffSummary };
type DialogState =
  | { type: 'create-student' }
  | { type: 'create-staff' }
  | { type: 'edit'; identity: Identity }
  | { type: 'roles'; identity: Identity }
  | { type: 'password'; identity: Identity }
  | null;

const BUILT_IN_ROLE_LABELS: Record<string, string> = {
  system_admin: '시스템 관리자',
  student_affairs_head: '학생관리부장',
  teacher: '교직원',
  student_council: '학생회',
  broadcast_club: '방송부',
  student: '학생',
};
const ROLE_ORDER = new Map(
  [
    'student',
    'teacher',
    'student_council',
    'broadcast_club',
    'student_affairs_head',
    'system_admin',
  ].map((role, index) => [role, index]),
);
const GENDER_LABELS: Record<StudentGender, string> = {
  male: '남',
  female: '여',
};

function IdentityDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} title={title} size="md" className="identity-dialog-shell">
      {children}
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="identity-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function displayIdentity(identity: Identity) {
  const identifier =
    identity.kind === 'student' ? identity.value.studentNo : identity.value.staffNo;
  return `${identifier} ${identity.value.name}`;
}

function roleLabel(roles: string[], labels: ReadonlyMap<string, string>) {
  return roles.length > 0
    ? roles.map((role) => labels.get(role) ?? BUILT_IN_ROLE_LABELS[role] ?? role).join(', ')
    : '역할 없음';
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(value))
    .replace(/\.$/, '');
}

function studentNumberParts(value: FormDataEntryValue | null, allowTestAccount = false) {
  const studentNo = Number(value);
  const grade = Math.floor(studentNo / 1000);
  const classNo = Math.floor(studentNo / 100) % 10;
  const number = studentNo % 100;
  const isRegular =
    Number.isInteger(studentNo) &&
    grade >= 1 &&
    grade <= 3 &&
    classNo >= 1 &&
    classNo <= 4 &&
    number >= 1 &&
    number <= 20;
  if (!isRegular && !(allowTestAccount && studentNo === 9999)) return null;
  return { studentNo, grade, classNo, number };
}

function contactText(email?: string, phone?: string) {
  return [email, phone].filter(Boolean).join(' · ') || '-';
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('students');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminIdentityListQuery>({ pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [issuedStaffNo, setIssuedStaffNo] = useState<number | null>(null);
  const sessionQuery = useQuery({
    queryKey: ['admin-session'],
    queryFn: api.session,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const canManageRoles = Boolean(
    sessionQuery.data?.isLogined &&
    (sessionQuery.data.roles?.map(String).includes('system_admin') ||
      sessionQuery.data.permissions?.includes('iam.manage')),
  );

  const query: AdminIdentityListQuery = {
    ...filters,
    page,
    sortBy: sorting[0]?.id as AdminIdentityListQuery['sortBy'],
    sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
  };
  const studentsQuery = useQuery({
    queryKey: ['admin-identities', 'students', query],
    queryFn: () => api.adminStudents(query),
    placeholderData: keepPreviousData,
    enabled: tab === 'students',
  });
  const staffQuery = useQuery({
    queryKey: ['admin-identities', 'staff', query],
    queryFn: () => api.adminStaff(query),
    placeholderData: keepPreviousData,
    enabled: tab === 'staff',
  });
  const rolesQuery = useQuery({
    queryKey: ['iam-roles'],
    queryFn: api.iamRoles,
    retry: false,
    enabled: canManageRoles,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-identities'] });
  };
  const createStudent = useMutation({
    mutationFn: api.createStudent,
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      showToast({ title: '학생을 추가했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '학생을 추가하지 못했습니다.', tone: 'danger' }),
  });
  const createStaff = useMutation({
    mutationFn: api.createStaff,
    onSuccess: async (result) => {
      setIssuedStaffNo(result.staffNo);
      setDialog(null);
      await refresh();
      showToast({
        title: '교직원을 추가했습니다.',
        description: `교사번호 ${result.staffNo}`,
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '교직원을 추가하지 못했습니다.', tone: 'danger' }),
  });
  const updateStudent = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof api.updateStudent>[1] }) =>
      api.updateStudent(id, input),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      showToast({ title: '학생 정보를 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '학생 정보를 저장하지 못했습니다.', tone: 'danger' }),
  });
  const updateStaff = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof api.updateStaff>[1] }) =>
      api.updateStaff(id, input),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      showToast({ title: '교직원 정보를 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '교직원 정보를 저장하지 못했습니다.', tone: 'danger' }),
  });
  const resetPassword = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      api.resetUserPassword(userId, password),
    onSuccess: () => {
      setDialog(null);
      showToast({ title: '비밀번호를 초기화했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '비밀번호를 초기화하지 못했습니다.', tone: 'danger' }),
  });
  const assignRoles = useMutation({
    mutationFn: ({ userId, ids }: { userId: number; ids: number[] }) =>
      api.assignUserRoles(userId, ids),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      showToast({ title: '사용자 역할을 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '사용자 역할을 저장하지 못했습니다.', tone: 'danger' }),
  });

  const activeQuery = tab === 'students' ? studentsQuery : staffQuery;
  const data = activeQuery.data;
  const roleLabels = new Map((rolesQuery.data ?? []).map((role) => [role.name, role.label]));
  const studentColumns: ColumnDef<AdminStudentSummary>[] = [
    {
      id: 'identifier',
      accessorKey: 'studentNo',
      header: '학번',
      meta: { align: 'center', width: 120 },
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: '이름',
      meta: { align: 'center', width: 150 },
    },
    {
      id: 'gender',
      header: '성별',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={`identity-gender${row.original.gender ? '' : ' is-missing'}`}>
          {row.original.gender ? GENDER_LABELS[row.original.gender] : '미입력'}
        </span>
      ),
      meta: { align: 'center', width: 80 },
    },
    {
      id: 'roles',
      header: '역할',
      enableSorting: false,
      cell: ({ row }) => roleLabel(row.original.roles, roleLabels),
      meta: { minWidth: 220, maxWidth: 360, truncate: true },
    },
    {
      id: 'contact',
      header: '연락처',
      enableSorting: false,
      cell: ({ row }) => contactText(row.original.email, row.original.phone),
      meta: { minWidth: 180, maxWidth: 280, truncate: true },
    },
    {
      id: 'lastLoginAt',
      accessorKey: 'lastLoginAt',
      header: '최근 로그인',
      cell: ({ row }) => formatDate(row.original.lastLoginAt),
      meta: { align: 'center', width: 140 },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => (
        <IdentityActions
          identity={{ kind: 'student', value: row.original }}
          canManageRoles={canManageRoles}
          onOpen={setDialog}
        />
      ),
      meta: { align: 'center', width: 132 },
    },
  ];
  const staffColumns: ColumnDef<AdminStaffSummary>[] = [
    {
      id: 'identifier',
      accessorKey: 'staffNo',
      header: '교사번호',
      meta: { align: 'center', width: 120 },
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: '이름',
      meta: { align: 'center', width: 140 },
    },
    {
      id: 'managedClasses',
      header: '담당 학급',
      enableSorting: false,
      cell: ({ row }) => {
        const classes = row.original.managedClasses ?? [];
        return classes.length > 0
          ? classes.map(({ grade, classNo }) => `${grade}-${classNo}`).join(', ')
          : '-';
      },
      meta: { align: 'center', width: 132, truncate: true },
    },
    {
      id: 'contact',
      header: '연락처',
      enableSorting: false,
      cell: ({ row }) => contactText(row.original.email, row.original.phone),
      meta: { minWidth: 200, maxWidth: 320, truncate: true },
    },
    {
      id: 'roles',
      header: '역할',
      enableSorting: false,
      cell: ({ row }) => roleLabel(row.original.roles, roleLabels),
      meta: { minWidth: 200, maxWidth: 320, truncate: true },
    },
    {
      id: 'lastLoginAt',
      accessorKey: 'lastLoginAt',
      header: '최근 로그인',
      cell: ({ row }) => formatDate(row.original.lastLoginAt),
      meta: { align: 'center', width: 140 },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => (
        <IdentityActions
          identity={{ kind: 'staff', value: row.original }}
          canManageRoles={canManageRoles}
          onOpen={setDialog}
        />
      ),
      meta: { align: 'center', width: 132 },
    },
  ];
  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setFilters({ pageSize: 20 });
    setSorting([]);
    setIssuedStaffNo(null);
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPage(1);
    setFilters({
      pageSize: filters.pageSize ?? 20,
      q: String(form.get('q') || ''),
      ...(tab === 'students'
        ? {
            grade: form.get('grade') ? Number(form.get('grade')) : undefined,
            classNo: form.get('classNo') ? Number(form.get('classNo')) : undefined,
          }
        : {}),
    });
  };

  const submitCreateStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parts = studentNumberParts(form.get('studentNo'));
    const studentNoInput = event.currentTarget.elements.namedItem('studentNo') as HTMLInputElement;
    if (!parts) {
      studentNoInput.setCustomValidity('학번은 1101~3420 범위의 학년·반·번호 조합이어야 합니다.');
      studentNoInput.reportValidity();
      return;
    }
    studentNoInput.setCustomValidity('');
    createStudent.mutate({
      studentNo: parts.studentNo,
      name: String(form.get('name')),
      gender: String(form.get('gender')) as StudentGender,
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      initialPassword: String(form.get('initialPassword')),
    });
  };

  const submitCreateStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createStaff.mutate({
      name: String(form.get('name')),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      initialPassword: String(form.get('initialPassword')),
    });
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>, identity: Identity) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (identity.kind === 'student') {
      const parts = studentNumberParts(form.get('studentNo'), identity.value.studentNo === 9999);
      const studentNoInput = event.currentTarget.elements.namedItem(
        'studentNo',
      ) as HTMLInputElement;
      if (!parts) {
        studentNoInput.setCustomValidity('학번은 1101~3420 범위여야 합니다.');
        studentNoInput.reportValidity();
        return;
      }
      studentNoInput.setCustomValidity('');
      updateStudent.mutate({
        id: identity.value.id,
        input: {
          studentNo: parts.studentNo,
          name: String(form.get('name')),
          gender: String(form.get('gender')) as StudentGender,
          email: String(form.get('email') || ''),
          phone: String(form.get('phone') || ''),
        },
      });
    } else {
      updateStaff.mutate({
        id: identity.value.id,
        input: {
          name: String(form.get('name')),
          email: String(form.get('email') || ''),
          phone: String(form.get('phone') || ''),
        },
      });
    }
  };

  return (
    <div className="identity-page">
      <div className="identity-page-toolbar">
        <SegmentedTabs
          value={tab}
          ariaLabel="사용자 구분"
          options={[
            { value: 'students', label: '학생' },
            { value: 'staff', label: '교직원' },
          ]}
          onChange={changeTab}
        />
        <button
          className="identity-primary-button"
          type="button"
          onClick={() =>
            setDialog({ type: tab === 'students' ? 'create-student' : 'create-staff' })
          }
        >
          <Plus size={17} /> {tab === 'students' ? '학생 추가' : '교직원 추가'}
        </button>
      </div>

      {issuedStaffNo ? (
        <div className="identity-success" role="status">
          교직원 계정이 생성되었습니다. 발급된 교사번호는 <strong>{issuedStaffNo}</strong>입니다.
          <button type="button" onClick={() => setIssuedStaffNo(null)}>
            확인
          </button>
        </div>
      ) : null}

      <section className="identity-panel">
        <TableToolbar summary={`총 ${data?.total ?? 0}명`}>
          <form className={`identity-filter-bar is-${tab}`} onSubmit={applyFilters}>
            <Field label="검색">
              <input name="q" defaultValue={filters.q} placeholder="학번·교사번호 또는 이름" />
            </Field>
            {tab === 'students' ? (
              <>
                <Field label="학년">
                  <select name="grade" defaultValue={filters.grade ?? ''}>
                    <option value="">전체</option>
                    {[1, 2, 3].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="반">
                  <select name="classNo" defaultValue={filters.classNo ?? ''}>
                    <option value="">전체</option>
                    {[1, 2, 3, 4].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}
            <PageSizeSelect
              value={filters.pageSize ?? 20}
              onChange={(pageSize) => {
                setPage(1);
                setFilters((current) => ({ ...current, pageSize }));
              }}
            />
            <button className="identity-secondary-button" type="submit">
              조회
            </button>
          </form>
        </TableToolbar>

        {tab === 'students' ? (
          <DataTable
            columns={studentColumns}
            data={studentsQuery.data?.items ?? []}
            loading={studentsQuery.isPending}
            loadingText="학생 목록을 불러오는 중입니다."
            emptyText={
              studentsQuery.isError ? '학생 목록을 불러오지 못했습니다.' : '조회된 학생이 없습니다.'
            }
            alwaysShowPagination
            manualSorting
            sorting={sorting}
            onSortingChange={(updater) => {
              setPage(1);
              setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
            }}
            pagination={{
              pageIndex: page - 1,
              pageSize: filters.pageSize ?? 20,
              pageCount: studentsQuery.data?.totalPages ?? 1,
              totalCount: studentsQuery.data?.total ?? 0,
              onPageChange: (pageIndex) => setPage(pageIndex + 1),
            }}
            getRowId={(student) => String(student.id)}
            caption="학생 목록"
          />
        ) : (
          <DataTable
            columns={staffColumns}
            data={staffQuery.data?.items ?? []}
            loading={staffQuery.isPending}
            loadingText="교직원 목록을 불러오는 중입니다."
            emptyText={
              staffQuery.isError
                ? '교직원 목록을 불러오지 못했습니다.'
                : '조회된 교직원이 없습니다.'
            }
            alwaysShowPagination
            manualSorting
            sorting={sorting}
            onSortingChange={(updater) => {
              setPage(1);
              setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
            }}
            pagination={{
              pageIndex: page - 1,
              pageSize: filters.pageSize ?? 20,
              pageCount: staffQuery.data?.totalPages ?? 1,
              totalCount: staffQuery.data?.total ?? 0,
              onPageChange: (pageIndex) => setPage(pageIndex + 1),
            }}
            getRowId={(staff) => String(staff.id)}
            caption="교직원 목록"
          />
        )}
      </section>

      {dialog?.type === 'create-student' ? (
        <IdentityDialog title="학생 추가" onClose={() => setDialog(null)}>
          <form className="identity-dialog-form" onSubmit={submitCreateStudent}>
            <div className="identity-form-grid two">
              <Field label="학번">
                <input
                  name="studentNo"
                  inputMode="numeric"
                  placeholder="예: 1101"
                  onInput={(event) => event.currentTarget.setCustomValidity('')}
                  required
                />
              </Field>
              <Field label="이름">
                <input name="name" required />
              </Field>
              <Field label="성별">
                <select name="gender" defaultValue="" required>
                  <option value="" disabled>
                    선택
                  </option>
                  <option value="male">남</option>
                  <option value="female">여</option>
                </select>
              </Field>
              <Field label="초기 비밀번호">
                <input
                  name="initialPassword"
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="이메일">
                <input name="email" type="email" />
              </Field>
              <Field label="전화번호">
                <input name="phone" inputMode="tel" />
              </Field>
            </div>
            <p className="identity-field-note">학년·반·번호는 학번에서 자동으로 확인합니다.</p>
            {createStudent.isError ? (
              <p className="identity-form-error">
                학생을 추가하지 못했습니다. 입력값과 중복 학번을 확인해 주세요.
              </p>
            ) : null}
            <DialogActions pending={createStudent.isPending} onClose={() => setDialog(null)} />
          </form>
        </IdentityDialog>
      ) : null}

      {dialog?.type === 'create-staff' ? (
        <IdentityDialog title="교직원 추가" onClose={() => setDialog(null)}>
          <form className="identity-dialog-form" onSubmit={submitCreateStaff}>
            <div className="identity-form-grid two">
              <Field label="이름">
                <input name="name" required />
              </Field>
              <Field label="초기 비밀번호">
                <input
                  name="initialPassword"
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="이메일">
                <input name="email" type="email" />
              </Field>
              <Field label="전화번호">
                <input name="phone" inputMode="tel" />
              </Field>
            </div>
            <p className="identity-field-note">교사번호는 생성 시 6자리 숫자로 자동 발급됩니다.</p>
            {createStaff.isError ? (
              <p className="identity-form-error">교직원을 추가하지 못했습니다.</p>
            ) : null}
            <DialogActions pending={createStaff.isPending} onClose={() => setDialog(null)} />
          </form>
        </IdentityDialog>
      ) : null}

      {dialog?.type === 'edit' ? (
        <IdentityDialog
          title={`${displayIdentity(dialog.identity)} 정보 수정`}
          onClose={() => setDialog(null)}
        >
          <EditForm
            identity={dialog.identity}
            pending={updateStudent.isPending || updateStaff.isPending}
            error={updateStudent.isError || updateStaff.isError}
            onSubmit={submitEdit}
            onClose={() => setDialog(null)}
          />
        </IdentityDialog>
      ) : null}

      {dialog?.type === 'roles' ? (
        <IdentityDialog
          title={`${displayIdentity(dialog.identity)} 역할 수정`}
          onClose={() => setDialog(null)}
        >
          <form
            className="identity-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              const userId = dialog.identity.value.userId;
              if (!userId) return;
              const ids = new FormData(event.currentTarget).getAll('roles').map(Number);
              assignRoles.mutate({ userId, ids });
            }}
          >
            <div className="identity-role-grid">
              {[...(rolesQuery.data ?? [])]
                .sort(
                  (left, right) =>
                    (ROLE_ORDER.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
                      (ROLE_ORDER.get(right.name) ?? Number.MAX_SAFE_INTEGER) ||
                    left.label.localeCompare(right.label, 'ko-KR'),
                )
                .map((role) => {
                  const required =
                    dialog.identity.kind === 'student'
                      ? role.name === 'student'
                      : role.name === 'teacher';
                  const checked = required || dialog.identity.value.roles.includes(role.name);
                  return (
                    <label key={role.id}>
                      {required ? <input type="hidden" name="roles" value={role.id} /> : null}
                      <input
                        type="checkbox"
                        name={required ? undefined : 'roles'}
                        value={role.id}
                        defaultChecked={checked}
                        disabled={required}
                      />{' '}
                      <span>{role.label}</span>
                      {required ? <small>기본 역할</small> : null}
                    </label>
                  );
                })}
            </div>
            {assignRoles.isError ? (
              <p className="identity-form-error">
                역할을 저장하지 못했습니다. 마지막 관리자 또는 본인 권한은 제거할 수 없습니다.
              </p>
            ) : null}
            <DialogActions pending={assignRoles.isPending} onClose={() => setDialog(null)} />
          </form>
        </IdentityDialog>
      ) : null}

      {dialog?.type === 'password' ? (
        <IdentityDialog
          title={`${displayIdentity(dialog.identity)} 비밀번호 초기화`}
          onClose={() => setDialog(null)}
        >
          <form
            className="identity-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const password = String(form.get('password'));
              const confirmation = event.currentTarget.elements.namedItem(
                'confirmPassword',
              ) as HTMLInputElement;
              if (password !== String(form.get('confirmPassword'))) {
                confirmation.setCustomValidity('비밀번호가 일치하지 않습니다.');
                confirmation.reportValidity();
                return;
              }
              confirmation.setCustomValidity('');
              const userId = dialog.identity.value.userId;
              if (userId) resetPassword.mutate({ userId, password });
            }}
          >
            <Field label="새 비밀번호">
              <input
                name="password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                required
                onInput={(event) => event.currentTarget.setCustomValidity('')}
              />
            </Field>
            <Field label="새 비밀번호 확인">
              <input
                name="confirmPassword"
                type="password"
                minLength={10}
                autoComplete="new-password"
                required
                onInput={(event) => event.currentTarget.setCustomValidity('')}
              />
            </Field>
            {resetPassword.isError ? (
              <p className="identity-form-error">비밀번호를 초기화하지 못했습니다.</p>
            ) : null}
            <DialogActions pending={resetPassword.isPending} onClose={() => setDialog(null)} />
          </form>
        </IdentityDialog>
      ) : null}
    </div>
  );
}

function IdentityActions({
  identity,
  canManageRoles,
  onOpen,
}: {
  identity: Identity;
  canManageRoles: boolean;
  onOpen: (state: DialogState) => void;
}) {
  const disabled = !identity.value.userId;
  return (
    <div className="identity-row-actions">
      <IconButton
        label="정보 수정"
        variant="primary"
        onClick={() => onOpen({ type: 'edit', identity })}
      >
        <Pencil aria-hidden="true" />
      </IconButton>
      {canManageRoles ? (
        <IconButton
          label="역할 수정"
          disabled={disabled}
          onClick={() => onOpen({ type: 'roles', identity })}
        >
          <ShieldCheck aria-hidden="true" />
        </IconButton>
      ) : null}
      <IconButton
        label="비밀번호 초기화"
        disabled={disabled}
        onClick={() => onOpen({ type: 'password', identity })}
      >
        <KeyRound aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function DialogActions({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return (
    <footer className="identity-dialog-actions">
      <button className="identity-secondary-button" type="button" onClick={onClose}>
        취소
      </button>
      <button className="identity-primary-button" type="submit" disabled={pending}>
        {pending ? '저장 중' : '저장'}
      </button>
    </footer>
  );
}

function EditForm({
  identity,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  identity: Identity;
  pending: boolean;
  error: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, identity: Identity) => void;
  onClose: () => void;
}) {
  return (
    <form className="identity-dialog-form" onSubmit={(event) => onSubmit(event, identity)}>
      {identity.kind === 'student' ? (
        <div className="identity-form-grid two">
          <Field label="학번">
            <input
              name="studentNo"
              defaultValue={identity.value.studentNo}
              inputMode="numeric"
              onInput={(event) => event.currentTarget.setCustomValidity('')}
              required
            />
          </Field>
          <Field label="이름">
            <input name="name" defaultValue={identity.value.name} required />
          </Field>
          <Field label="성별">
            <select name="gender" defaultValue={identity.value.gender ?? ''} required>
              <option value="" disabled>
                선택
              </option>
              <option value="male">남</option>
              <option value="female">여</option>
            </select>
          </Field>
          <Field label="이메일">
            <input name="email" type="email" defaultValue={identity.value.email} />
          </Field>
          <Field label="전화번호">
            <input name="phone" inputMode="tel" defaultValue={identity.value.phone} />
          </Field>
        </div>
      ) : (
        <div className="identity-form-grid two">
          <Field label="교사번호">
            <input value={identity.value.staffNo} readOnly />
          </Field>
          <Field label="이름">
            <input name="name" defaultValue={identity.value.name} required />
          </Field>
          <Field label="이메일">
            <input name="email" type="email" defaultValue={identity.value.email} />
          </Field>
          <Field label="전화번호">
            <input name="phone" inputMode="tel" defaultValue={identity.value.phone} />
          </Field>
        </div>
      )}
      {error ? <p className="identity-form-error">정보를 저장하지 못했습니다.</p> : null}
      <DialogActions pending={pending} onClose={onClose} />
    </form>
  );
}

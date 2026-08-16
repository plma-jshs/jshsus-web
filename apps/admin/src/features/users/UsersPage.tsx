import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type {
  AccountActivationBulkIssueResult,
  AccountActivationIssueResult,
  AdminIdentityListQuery,
  AdminSchoolYearSummary,
  AdminStudentRosterRow,
  AdminStaffSummary,
  AdminStudentSummary,
  AdminUserStatus,
  RosterImportAction,
  RosterImportPreview,
  RosterImportRowInput,
  StudentGender,
} from '@jshsus/types';
import {
  Copy,
  Download,
  FileSpreadsheet,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  AdminSelect,
  Dialog,
  type DialogSize,
  RowActionButton,
  RowActions,
  SegmentedTabs,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import { formatAdminDate } from '../../shared/lib/date';
import { loadExcelJs } from '../../shared/lib/excel';
import './users.css';

type Tab = 'students' | 'staff';
type Identity =
  { kind: 'student'; value: AdminStudentSummary } | { kind: 'staff'; value: AdminStaffSummary };
type DialogState =
  | { type: 'create-student' }
  | { type: 'create-staff' }
  | { type: 'roster' }
  | { type: 'edit'; identity: Identity }
  | { type: 'activation'; identity: Identity }
  | { type: 'roles'; identity: Identity }
  | null;

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
const ROLE_LABELS: Record<string, string> = {
  student: '학생',
  teacher: '교사',
  student_council: '학생회',
  broadcast_club: '방송부',
  student_affairs_head: '학생부장',
  system_admin: '시스템 관리자',
};
const ROSTER_ACTION_LABELS: Record<RosterImportAction, string> = {
  create: '생성',
  update: '수정',
  unchanged: '변경 없음',
  graduate: '졸업',
  conflict: '충돌',
  invalid: '오류',
};
const ROSTER_PREVIEW_GROUPS: Array<{ label: string; actions: RosterImportAction[] }> = [
  { label: '신규 입학', actions: ['create'] },
  { label: '진급·정보 변경', actions: ['update'] },
  { label: '졸업', actions: ['graduate'] },
  { label: '변경 없음', actions: ['unchanged'] },
  { label: '확인이 필요한 행', actions: ['conflict', 'invalid'] },
];

function rosterPreviewRowsForDisplay(rows: RosterImportPreview['rows']) {
  const initialRows = rows.slice(0, 120);
  const errorRows = rows
    .slice(120)
    .filter((row) => row.action === 'conflict' || row.action === 'invalid');
  return [...initialRows, ...errorRows];
}

function IdentityDialog({
  title,
  children,
  onClose,
  size = 'md',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: DialogSize;
}) {
  return (
    <Dialog open onClose={onClose} title={title} size={size} className="identity-dialog-shell">
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

function identityNumber(identity: Identity) {
  return identity.kind === 'student' ? identity.value.studentNo : identity.value.staffNo;
}

function formatDate(value?: string) {
  if (!value) return '-';
  return formatAdminDate(value, {
    month: '2-digit',
    day: '2-digit',
  });
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
  const normalizedPhone = normalizeDisplayPhone(phone);
  return [email, normalizedPhone].filter(Boolean).join(' · ') || '-';
}

function rolesText(roles: readonly string[] | undefined) {
  return roles?.length ? roles.map((role) => ROLE_LABELS[role] ?? role).join(', ') : '-';
}

function normalizeDisplayPhone(value?: string) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('10')) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith('010')) return digits;
  return value || undefined;
}

function activeSchoolYear(years?: AdminSchoolYearSummary[]) {
  return years?.find((year) => year.isActive)?.year ?? new Date().getFullYear();
}

function normalizeRosterHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s_-]/g, '');
}

function headerColumn(headers: ReadonlyMap<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const column = headers.get(normalizeRosterHeader(alias));
    if (column) return column;
  }
  return undefined;
}

function rosterCellText(cell: { text: string; value: unknown }) {
  let text = '';
  let rawValue: unknown;
  try {
    text = String(cell.text ?? '').trim();
  } catch {
    // ExcelJS may throw while resolving the text getter for an empty/null cell.
    // Fall back to the raw value below so a blank template cell is harmless.
  }
  if (text) return text;
  try {
    rawValue = cell.value;
  } catch {
    // Some styled blank cells expose a null-backed value getter in ExcelJS.
    rawValue = undefined;
  }
  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    return String(rawValue).trim();
  }
  if (rawValue && typeof rawValue === 'object') {
    const value = rawValue as {
      richText?: Array<{ text?: unknown }>;
      result?: unknown;
      text?: unknown;
    };
    if (value.richText)
      return value.richText
        .map((part) => String(part.text ?? ''))
        .join('')
        .trim();
    if (value.text !== undefined) return String(value.text).trim();
    if (value.result !== undefined) return String(value.result).trim();
  }
  return '';
}

function rosterNumber(value: string) {
  const normalized = value.replace(/[\s,]/g, '');
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : undefined;
}

async function parseRosterWorkbook(file: File): Promise<RosterImportRowInput[]> {
  const { Workbook } = await loadExcelJs();
  const workbook = new Workbook();
  const bytes = (await file.arrayBuffer()) as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(bytes);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('엑셀 시트를 찾을 수 없습니다.');

  let headerRowNumber = 0;
  let headers = new Map<string, number>();
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
    const candidate = new Map<string, number>();
    worksheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
      const key = normalizeRosterHeader(rosterCellText(cell));
      if (key) candidate.set(key, columnNumber);
    });
    const candidateStudentNoColumn = headerColumn(candidate, [
      '신규 학번',
      '신규학번',
      '학번',
      'student_no',
      'studentNo',
    ]);
    const candidateNameColumn = headerColumn(candidate, ['이름', '성명', 'name']);
    if (
      candidateStudentNoColumn &&
      candidateNameColumn &&
      candidateStudentNoColumn !== candidateNameColumn
    ) {
      headerRowNumber = rowNumber;
      headers = candidate;
      break;
    }
  }

  if (!headerRowNumber) {
    throw new Error('학번과 이름 헤더가 있는 행을 찾을 수 없습니다.');
  }

  const studentNoColumn = headerColumn(headers, [
    '신규 학번',
    '신규학번',
    '학번',
    'student_no',
    'studentNo',
  ]);
  const nameColumn = headerColumn(headers, ['이름', '성명', 'name']);
  if (!studentNoColumn || !nameColumn) {
    throw new Error('학번과 이름 헤더가 필요합니다.');
  }

  const genderColumn = headerColumn(headers, ['성별', 'gender']);
  const phoneColumn = headerColumn(headers, ['전화번호', '휴대폰', '연락처', 'phone', 'mobile']);
  const emailColumn = headerColumn(headers, ['이메일', 'email']);
  const previousStudentNoColumn = headerColumn(headers, [
    '기존 학번',
    '기존학번',
    '이전학번',
    'previous_student_no',
    'previousStudentNo',
    'oldStudentNo',
  ]);
  const userIdColumn = headerColumn(headers, ['user_id', 'userId', '사용자id', '사용자번호']);
  const rows: RosterImportRowInput[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const studentNoText = rosterCellText(row.getCell(studentNoColumn));
    const name = rosterCellText(row.getCell(nameColumn));
    const optionalCells = [
      genderColumn,
      phoneColumn,
      emailColumn,
      previousStudentNoColumn,
      userIdColumn,
    ]
      .filter((column): column is number => column !== undefined)
      .map((column) => rosterCellText(row.getCell(column)));
    if (!studentNoText && !name && optionalCells.every((value) => !value)) return;

    const parsedStudentNo = rosterNumber(studentNoText);
    const studentNo = !studentNoText ? 0 : (parsedStudentNo ?? -1);
    const input: RosterImportRowInput = {
      rowNumber,
      studentNo,
      name,
    };
    if (genderColumn) input.gender = rosterCellText(row.getCell(genderColumn));
    if (phoneColumn) input.phone = rosterCellText(row.getCell(phoneColumn));
    if (emailColumn) input.email = rosterCellText(row.getCell(emailColumn));
    if (previousStudentNoColumn) {
      const text = rosterCellText(row.getCell(previousStudentNoColumn));
      if (text) {
        input.previousStudentNo = rosterNumber(text) ?? -1;
      }
    }
    if (userIdColumn) {
      const value = rosterNumber(rosterCellText(row.getCell(userIdColumn)));
      if (value !== undefined && value > 0) input.userId = value;
    }
    rows.push(input);
  });

  if (rows.length === 0) throw new Error('읽을 학생 행이 없습니다.');
  return rows;
}

async function downloadRosterTemplate(targetYear: number, students: AdminStudentRosterRow[]) {
  const { Workbook } = await loadExcelJs();
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('학생명단');
  worksheet.columns = [
    { key: 'studentNo', width: 18 },
    { key: 'name', width: 24 },
    { key: 'previousStudentNo', width: 18 },
  ];

  worksheet.mergeCells('A1:C1');
  worksheet.mergeCells('A2:C2');
  worksheet.getCell('A1').value =
    `${targetYear}학년도 안내\n신입생: 맨 아래 빈 행에 [신규 학번]과 [이름] 입력 ([기존 학번]은 빈칸)\n진급생: 기존 목록의 해당 학생 행에 [신규 학번] 입력\n졸업생: 해당 학생 행 전체 삭제`;
  worksheet.getRow(1).height = 82;
  worksheet.getRow(2).height = 8;
  for (const rowNumber of [1]) {
    for (let columnNumber = 1; columnNumber <= 3; columnNumber += 1) {
      const cell = worksheet.getRow(rowNumber).getCell(columnNumber);
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF24333D' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowNumber === 1 ? 'FFFFE7C2' : 'FFE3F0FF' },
      };
    }
  }

  const header = worksheet.getRow(3);
  header.getCell(1).value = '신규 학번';
  header.getCell(2).value = '이름';
  header.getCell(3).value = '기존 학번';
  header.height = 26;
  header.eachCell((cell) => {
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF147D86' } };
  });

  for (const student of [...students].sort((left, right) => left.studentNo - right.studentNo)) {
    worksheet.addRow({ studentNo: '', name: student.name, previousStudentNo: student.studentNo });
  }
  for (let index = 0; index < 10; index += 1) {
    worksheet.addRow({ studentNo: '', name: '', previousStudentNo: '' });
  }
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    row.eachCell((cell) => {
      cell.font = { name: '맑은 고딕', size: 11, color: { argb: 'FF24333D' } };
    });
    row.getCell(1).numFmt = '0';
    row.getCell(3).numFmt = '0';
  });
  worksheet.autoFilter = { from: 'A3', to: 'C3' };
  worksheet.views = [{ state: 'frozen', ySplit: 3 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${targetYear}학년도_학생명단_업로드_양식.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadActivationCodes(result: AccountActivationBulkIssueResult) {
  const rows = [
    ['학년도', '학번', '이름', '인증코드', '발급일시'],
    ...result.codes.map((item) => [
      result.schoolYear,
      item.identityNumber,
      item.name ?? '',
      item.code,
      result.issuedAt,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `student-activation-codes-${result.issuedAt.slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('students');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminIdentityListQuery>({ pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'identifier', desc: false }]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [issuedStaffIdentity, setIssuedStaffIdentity] = useState<{
    staffNo: number;
    activationCode?: string;
  } | null>(null);
  const [rosterRows, setRosterRows] = useState<RosterImportRowInput[]>([]);
  const [rosterFileName, setRosterFileName] = useState('');
  const [rosterFileError, setRosterFileError] = useState<string | null>(null);
  const [rosterParsing, setRosterParsing] = useState(false);
  const [rosterPreview, setRosterPreview] = useState<RosterImportPreview | null>(null);
  const [rosterYear, setRosterYear] = useState<number | ''>('');
  const [issuedActivation, setIssuedActivation] = useState<AccountActivationIssueResult | null>(
    null,
  );
  const [bulkActivationResult, setBulkActivationResult] =
    useState<AccountActivationBulkIssueResult | null>(null);
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
  const canManageUsers = Boolean(
    sessionQuery.data?.isLogined &&
    (sessionQuery.data.roles?.map(String).includes('system_admin') ||
      sessionQuery.data.permissions?.includes('users.manage')),
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
    enabled: canManageRoles || dialog?.type === 'roles',
  });
  const roleIdentity = dialog?.type === 'roles' ? dialog.identity : null;
  const userRolesQuery = useQuery({
    queryKey: ['admin-user-roles', roleIdentity?.value.userId],
    queryFn: () => api.userRoles(roleIdentity?.value.userId ?? 0),
    retry: false,
    enabled: Boolean(canManageRoles && roleIdentity?.value.userId),
  });
  const schoolYearsQuery = useQuery({
    queryKey: ['admin-school-years'],
    queryFn: api.schoolYears,
    enabled: tab === 'students' || dialog?.type === 'roster',
  });
  const rosterStudentsQuery = useQuery({
    queryKey: ['admin-student-roster-template'],
    queryFn: () => api.studentRoster(),
    enabled: dialog?.type === 'roster',
  });
  const defaultSchoolYear = activeSchoolYear(schoolYearsQuery.data);
  const schoolYearOptions = [
    ...new Set([defaultSchoolYear, ...(schoolYearsQuery.data ?? []).map((year) => year.year)]),
  ].sort((left, right) => right - left);

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
    mutationFn: async (input: Parameters<typeof api.createStaff>[0]) => {
      const result = await api.createStaff(input);
      const activation = await api
        .issueAccountActivation({
          identityType: 'staff',
          identityNumber: result.staffNo,
        })
        .catch(() => null);
      return { ...result, activation };
    },
    onSuccess: async (result) => {
      setIssuedStaffIdentity({
        staffNo: result.staffNo,
        activationCode: result.activation?.code,
      });
      setDialog(null);
      await refresh();
      showToast({
        title: '교직원을 추가했습니다.',
        description: `교사번호 ${result.staffNo}`,
        tone: result.activation ? 'success' : 'warning',
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
  const issueActivation = useMutation({
    mutationFn: api.issueAccountActivation,
    onSuccess: (result) => {
      setIssuedActivation(result);
      showToast({ title: '인증코드를 발급했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '인증코드를 발급하지 못했습니다.', tone: 'danger' }),
  });
  const issueBulkActivation = useMutation({
    mutationFn: api.issueStudentActivationBulk,
    onSuccess: (result) => {
      setBulkActivationResult(result);
      showToast({
        title: '학생 인증코드를 일괄 발급했습니다.',
        description: `${result.total}명`,
        tone: 'success',
      });
    },
    onError: () =>
      showToast({ title: '학생 인증코드를 일괄 발급하지 못했습니다.', tone: 'danger' }),
  });
  const updateUserStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: number; status: AdminUserStatus }) =>
      api.updateUserStatus(userId, status),
    onSuccess: async (result) => {
      await refresh();
      showToast({
        title:
          result.status === 'graduated'
            ? '학생 학적을 종료했습니다.'
            : '교직원 계정을 비활성화했습니다.',
        description:
          result.cognitoPending || result.cleanupPending
            ? '외부 개인정보 정리는 재시도 대기 중입니다.'
            : '로그인 차단과 개인정보 정리를 완료했습니다.',
        tone: result.cognitoPending || result.cleanupPending ? 'warning' : 'success',
      });
    },
    onError: () => showToast({ title: '학생 상태를 변경하지 못했습니다.', tone: 'danger' }),
  });
  const previewRoster = useMutation({
    mutationFn: api.previewStudentRoster,
    onSuccess: (preview) => {
      setRosterPreview(preview);
      showToast({ title: '명단 미리보기를 생성했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '명단을 검증하지 못했습니다.', tone: 'danger' }),
  });
  const applyRoster = useMutation({
    mutationFn: api.applyStudentRoster,
    onSuccess: async (result) => {
      setRosterPreview(result);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['admin-school-years'] }),
      ]);
      showToast({ title: '학생 명단을 반영했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '학생 명단을 반영하지 못했습니다.', tone: 'danger' }),
  });

  const activeQuery = tab === 'students' ? studentsQuery : staffQuery;
  const data = activeQuery.data;
  const studentColumns: ColumnDef<AdminStudentSummary>[] = [
    {
      id: 'identifier',
      accessorKey: 'studentNo',
      header: '학번',
      meta: { align: 'center', width: 120, mobileRole: 'subtitle' },
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: '이름',
      meta: { align: 'left', width: 150, mobileRole: 'title' },
    },
    {
      id: 'roles',
      header: '역할',
      enableSorting: false,
      cell: ({ row }) => rolesText(row.original.roles),
      meta: { align: 'left', width: 150, truncate: true, hideOnMobile: true },
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
      meta: { align: 'center', width: 80, hideOnMobile: true },
    },
    {
      id: 'contact',
      header: '연락처',
      enableSorting: false,
      cell: ({ row }) => contactText(row.original.email, row.original.phone),
      meta: { minWidth: 180, maxWidth: 280, truncate: true },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => (row.original.status === 'graduated' ? '졸업·학적종료' : '재학'),
      meta: { align: 'center', width: 112, mobileRole: 'badge' },
    },
    {
      id: 'accountStatus',
      header: '계정',
      enableSorting: false,
      cell: ({ row }) => (row.original.accountStatus === 'active' ? '가입 완료' : '미가입'),
      meta: { align: 'center', width: 112, mobileRole: 'badge' },
    },
    {
      id: 'lastLoginAt',
      accessorKey: 'lastLoginAt',
      header: '최근 로그인',
      cell: ({ row }) => formatDate(row.original.lastLoginAt),
      meta: { align: 'center', width: 140, hideOnMobile: true },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => (
        <IdentityActions
          identity={{ kind: 'student', value: row.original }}
          isLastRow={row.index >= Math.max((studentsQuery.data?.items.length ?? 0) - 2, 0)}
          canManageRoles={canManageRoles}
          canManageStatus={canManageUsers}
          statusPending={updateUserStatus.isPending}
          onOpen={setDialog}
          onUpdateStatus={(identity, status) => {
            if (!identity.value.userId) return;
            updateUserStatus.mutate({ userId: identity.value.userId, status });
          }}
          onOpenActivation={(identity) => {
            issueActivation.reset();
            setIssuedActivation(null);
            setDialog({ type: 'activation', identity });
          }}
        />
      ),
      meta: { align: 'center', width: 152, mobileRole: 'actions' },
    },
  ];
  const staffColumns: ColumnDef<AdminStaffSummary>[] = [
    {
      id: 'identifier',
      accessorKey: 'staffNo',
      header: '교사번호',
      meta: { align: 'center', width: 120, mobileRole: 'subtitle' },
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: '이름',
      meta: { align: 'left', width: 140, mobileRole: 'title' },
    },
    {
      id: 'roles',
      header: '역할',
      enableSorting: false,
      cell: ({ row }) => rolesText(row.original.roles),
      meta: { align: 'left', width: 150, truncate: true, hideOnMobile: true },
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
      id: 'gender',
      header: '성별',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={`identity-gender${row.original.gender ? '' : ' is-missing'}`}>
          {row.original.gender ? GENDER_LABELS[row.original.gender] : '미입력'}
        </span>
      ),
      meta: { align: 'center', width: 80, hideOnMobile: true },
    },
    {
      id: 'contact',
      header: '연락처',
      enableSorting: false,
      cell: ({ row }) => contactText(row.original.email, row.original.phone),
      meta: { minWidth: 200, maxWidth: 320, truncate: true },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => (row.original.status === 'deleted' ? '전근·퇴직' : '재직'),
      meta: { align: 'center', width: 112, mobileRole: 'badge' },
    },
    {
      id: 'accountStatus',
      accessorKey: 'accountStatus',
      header: '계정',
      cell: ({ row }) => (row.original.accountStatus === 'active' ? '가입 완료' : '미가입'),
      meta: { align: 'center', width: 112, mobileRole: 'badge' },
    },
    {
      id: 'lastLoginAt',
      accessorKey: 'lastLoginAt',
      header: '최근 로그인',
      cell: ({ row }) => formatDate(row.original.lastLoginAt),
      meta: { align: 'center', width: 140, hideOnMobile: true },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => (
        <IdentityActions
          identity={{ kind: 'staff', value: row.original }}
          isLastRow={row.index >= Math.max((staffQuery.data?.items.length ?? 0) - 2, 0)}
          canManageRoles={canManageRoles}
          canManageStatus={canManageUsers}
          statusPending={updateUserStatus.isPending}
          onOpen={setDialog}
          onUpdateStatus={(identity, status) => {
            if (!identity.value.userId) return;
            updateUserStatus.mutate({ userId: identity.value.userId, status });
          }}
          onOpenActivation={(identity) => {
            issueActivation.reset();
            setIssuedActivation(null);
            setDialog({ type: 'activation', identity });
          }}
        />
      ),
      meta: { align: 'center', width: 132, mobileRole: 'actions' },
    },
  ];
  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setFilters({ pageSize: 20 });
    setSorting([{ id: 'identifier', desc: false }]);
    setIssuedStaffIdentity(null);
  };

  const updateFilters = (nextFilters: Partial<AdminIdentityListQuery>) => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      ...nextFilters,
      pageSize: current.pageSize ?? 20,
    }));
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
      ...(form.get('gender') ? { gender: String(form.get('gender')) as StudentGender } : {}),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
    });
  };

  const submitCreateStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createStaff.mutate({
      name: String(form.get('name')),
      gender: String(form.get('gender')) as StudentGender,
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
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
          gender: String(form.get('gender')) as StudentGender,
          email: String(form.get('email') || ''),
          phone: String(form.get('phone') || ''),
        },
      });
    }
  };

  const rosterPayload = (
    rows = rosterRows,
    fileName = rosterFileName,
    targetYear = Number(rosterYear || defaultSchoolYear + 1),
  ) => ({
    schoolYear: targetYear,
    fileName: fileName || undefined,
    rows,
    activateYear: true,
  });

  const requestRosterPreview = (
    rows: RosterImportRowInput[],
    fileName: string,
    targetYear: number,
  ) => {
    previewRoster.mutate(rosterPayload(rows, fileName, targetYear));
  };

  const openRosterDialog = () => {
    setRosterRows([]);
    setRosterFileName('');
    setRosterFileError(null);
    setRosterParsing(false);
    setRosterPreview(null);
    setRosterYear(defaultSchoolYear + 1);
    setDialog({ type: 'roster' });
  };

  const handleRosterFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setRosterPreview(null);
    setRosterRows([]);
    setRosterFileName('');
    setRosterFileError(null);
    setRosterParsing(Boolean(file));
    if (!file) return;
    try {
      const rows = await parseRosterWorkbook(file);
      setRosterFileName(file.name);
      setRosterRows(rows);
      requestRosterPreview(rows, file.name, Number(rosterYear || defaultSchoolYear + 1));
    } catch (error) {
      input.value = '';
      const message = error instanceof Error ? error.message : '엑셀 파일을 읽지 못했습니다.';
      setRosterFileError(message);
      showToast({
        title: message,
        tone: 'danger',
      });
    } finally {
      setRosterParsing(false);
    }
  };
  const bulkActivationPayload = () => ({
    schoolYear: filters.schoolYear ?? defaultSchoolYear,
    grade: filters.grade,
    classNo: filters.classNo,
  });
  const confirmBulkActivation = () => {
    const scope = [
      filters.schoolYear ? `${filters.schoolYear}학년도` : '활성 학년도',
      filters.grade ? `${filters.grade}학년` : null,
      filters.classNo ? `${filters.classNo}반` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const ok = window.confirm(
      `${scope} 중 아직 가입하지 않은 학생에게 인증코드를 발급합니다. 이미 가입한 학생과 이미 사용 가능한 인증코드가 있는 학생은 제외됩니다.`,
    );
    if (ok) issueBulkActivation.mutate(bulkActivationPayload());
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
        <div className="identity-toolbar-actions">
          {tab === 'students' ? (
            <>
              <button
                className="identity-secondary-button"
                type="button"
                onClick={() => openRosterDialog()}
              >
                <FileSpreadsheet size={17} /> 학생 명단 업로드
              </button>
              <button
                className="identity-secondary-button"
                type="button"
                disabled={issueBulkActivation.isPending}
                onClick={confirmBulkActivation}
              >
                <KeyRound size={17} />
                {issueBulkActivation.isPending ? '일괄 발급 중' : '인증코드 일괄 발급'}
              </button>
            </>
          ) : null}
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
      </div>

      {issuedStaffIdentity ? (
        <div className="identity-success" role="status">
          교직원 계정이 생성되었습니다. 교사번호 <strong>{issuedStaffIdentity.staffNo}</strong>
          {issuedStaffIdentity.activationCode ? (
            <>
              {' '}
              · 인증코드 <strong>{issuedStaffIdentity.activationCode}</strong>
            </>
          ) : (
            <> · 인증코드는 행의 더보기 메뉴에서 발급해 주세요.</>
          )}
          <button type="button" onClick={() => setIssuedStaffIdentity(null)}>
            확인
          </button>
        </div>
      ) : null}

      {bulkActivationResult ? (
        <div className="identity-success identity-success--bulk" role="status">
          {bulkActivationResult.schoolYear}학년도 미가입 학생 인증코드{' '}
          <strong>{bulkActivationResult.total}건</strong>을 발급했습니다.
          <div className="identity-success__actions">
            <button type="button" onClick={() => downloadActivationCodes(bulkActivationResult)}>
              <Download size={15} /> CSV 다운로드
            </button>
            <button type="button" onClick={() => setBulkActivationResult(null)}>
              확인
            </button>
          </div>
        </div>
      ) : null}

      <section className="identity-panel">
        <TableToolbar
          summary={`총 ${data?.total ?? 0}명`}
          mobileSearch={
            <label className="identity-field identity-search-field">
              <Search size={16} aria-hidden="true" />
              <input
                name="q"
                value={filters.q ?? ''}
                aria-label="학생·교직원 검색"
                onChange={(event) => updateFilters({ q: event.currentTarget.value })}
                placeholder="학번·교사번호, 이름 또는 역할 검색"
              />
            </label>
          }
        >
          <div className={`identity-filter-bar is-${tab}`}>
            {tab === 'students' ? (
              <>
                <Field label="학년도">
                  <AdminSelect
                    name="schoolYear"
                    value={filters.schoolYear ?? defaultSchoolYear}
                    onChange={(event) =>
                      updateFilters({
                        schoolYear: event.currentTarget.value
                          ? Number(event.currentTarget.value)
                          : undefined,
                      })
                    }
                  >
                    {schoolYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}학년도
                      </option>
                    ))}
                  </AdminSelect>
                </Field>
                <Field label="학년">
                  <AdminSelect
                    name="grade"
                    value={filters.grade ?? ''}
                    onChange={(event) =>
                      updateFilters({
                        grade: event.currentTarget.value
                          ? Number(event.currentTarget.value)
                          : undefined,
                      })
                    }
                  >
                    <option value="">전체 학년</option>
                    {[1, 2, 3].map((value) => (
                      <option key={value} value={value}>
                        {value}학년
                      </option>
                    ))}
                  </AdminSelect>
                </Field>
                <Field label="반">
                  <AdminSelect
                    name="classNo"
                    value={filters.classNo ?? ''}
                    onChange={(event) =>
                      updateFilters({
                        classNo: event.currentTarget.value
                          ? Number(event.currentTarget.value)
                          : undefined,
                      })
                    }
                  >
                    <option value="">전체 반</option>
                    {[1, 2, 3, 4].map((value) => (
                      <option key={value} value={value}>
                        {value}반
                      </option>
                    ))}
                  </AdminSelect>
                </Field>
              </>
            ) : null}
          </div>
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
              onPageSizeChange: (pageSize) => updateFilters({ pageSize }),
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
              onPageSizeChange: (pageSize) => updateFilters({ pageSize }),
            }}
            getRowId={(staff) => String(staff.id)}
            caption="교직원 목록"
          />
        )}
      </section>

      {dialog?.type === 'roster' ? (
        <IdentityDialog title="학생 명단 업로드" size="lg" onClose={() => setDialog(null)}>
          <div className="identity-dialog-form identity-roster-dialog">
            {!rosterPreview ? (
              <div className="identity-form-grid three">
                <Field label="적용 학년도">
                  <input
                    name="schoolYear"
                    type="number"
                    min={2000}
                    max={2100}
                    value={rosterYear}
                    onChange={(event) => {
                      const nextYear = event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : '';
                      setRosterYear(nextYear);
                      setRosterPreview(null);
                      if (nextYear && rosterRows.length > 0 && rosterFileName) {
                        requestRosterPreview(rosterRows, rosterFileName, nextYear);
                      }
                    }}
                    required
                  />
                </Field>
                <Field label="엑셀 파일">
                  <label className="identity-file-picker">
                    <input type="file" accept=".xlsx" onChange={handleRosterFileChange} />
                    <span>
                      <FileSpreadsheet size={16} aria-hidden="true" />
                      파일 선택
                    </span>
                    <small>{rosterFileName || '선택된 파일 없음'}</small>
                  </label>
                </Field>
                <div className="identity-roster-toolbox">
                  <button
                    className="identity-secondary-button"
                    type="button"
                    disabled={rosterStudentsQuery.isPending}
                    onClick={() => {
                      void downloadRosterTemplate(
                        Number(rosterYear || defaultSchoolYear + 1),
                        (rosterStudentsQuery.data ?? []).filter(
                          (student) => student.studentNo !== 9999,
                        ),
                      );
                    }}
                  >
                    <Download size={16} /> 양식 다운로드
                  </button>
                </div>
              </div>
            ) : null}

            {rosterParsing ? (
              <p className="identity-field-note">엑셀 파일을 읽는 중입니다.</p>
            ) : rosterFileError ? (
              <p className="identity-form-error" role="alert">
                {rosterFileError}
              </p>
            ) : rosterFileName ? (
              <p className="identity-field-note">
                {rosterFileName} · {rosterRows.length}개 행
              </p>
            ) : null}

            {previewRoster.isPending ? (
              <div className="identity-roster-loading" role="status">
                업로드한 명단을 기존 재학생 정보와 대조하고 있습니다.
              </div>
            ) : null}

            {rosterPreview ? (
              <div className="identity-roster-preview">
                <div className="identity-roster-summary">
                  {Object.entries(rosterPreview.summary)
                    .filter(([, count]) => count > 0)
                    .map(([action, count]) => (
                      <span key={action} className={`identity-roster-chip is-${action}`}>
                        {ROSTER_ACTION_LABELS[action as RosterImportAction]} {count}
                      </span>
                    ))}
                </div>
                {ROSTER_PREVIEW_GROUPS.map((group) => {
                  const rows = rosterPreviewRowsForDisplay(rosterPreview.rows).filter((row) =>
                    group.actions.includes(row.action),
                  );
                  if (rows.length === 0) return null;
                  return (
                    <section className="identity-roster-group" key={group.label}>
                      <div className="identity-roster-group__heading">
                        <strong>{group.label}</strong>
                        <span>{rows.length}건</span>
                      </div>
                      <div className="identity-roster-table-wrap">
                        <table className="identity-roster-table">
                          <thead>
                            <tr>
                              <th>행</th>
                              <th>상태</th>
                              <th>신규 학번</th>
                              <th>기존 학번</th>
                              <th>이름</th>
                              <th>오류·처리 내용</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, index) => (
                              <tr key={`${row.rowNumber}-${row.studentNo ?? index}`}>
                                <td>{row.rowNumber || '자동'}</td>
                                <td>
                                  <span className={`identity-roster-status is-${row.action}`}>
                                    {ROSTER_ACTION_LABELS[row.action]}
                                  </span>
                                </td>
                                <td>{row.studentNo && row.studentNo > 0 ? row.studentNo : '-'}</td>
                                <td>{row.previousStudentNo ?? '-'}</td>
                                <td>{row.name || '-'}</td>
                                <td>{row.messages.join(' ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  );
                })}
                {rosterPreview.rows.length > 120 ? (
                  <p className="identity-field-note">
                    전체 {rosterPreview.rows.length}개 행이 검증되었습니다.
                  </p>
                ) : null}
              </div>
            ) : null}

            {previewRoster.isError || applyRoster.isError ? (
              <p className="identity-form-error">
                {previewRoster.error instanceof Error
                  ? previewRoster.error.message
                  : applyRoster.error instanceof Error
                    ? applyRoster.error.message
                    : '명단을 처리하지 못했습니다. 오류 행을 확인해 주세요.'}
              </p>
            ) : null}

            {rosterPreview ? (
              <footer className="identity-dialog-actions">
                <button
                  className="identity-primary-button"
                  type="button"
                  disabled={!rosterPreview.canApply || applyRoster.isPending}
                  onClick={() => applyRoster.mutate(rosterPayload())}
                >
                  {applyRoster.isPending ? '반영 중' : '명단 반영'}
                </button>
              </footer>
            ) : null}
          </div>
        </IdentityDialog>
      ) : null}

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
              <Field label="성별 (선택)">
                <AdminSelect name="gender" defaultValue="" aria-label="성별">
                  <option value="">나중에 입력</option>
                  <option value="male">남</option>
                  <option value="female">여</option>
                </AdminSelect>
              </Field>
              <Field label="이메일 (선택)">
                <input name="email" type="email" />
              </Field>
              <Field label="전화번호 (선택)">
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
              <Field label="성별">
                <AdminSelect name="gender" defaultValue="" required aria-label="성별">
                  <option value="" disabled>
                    선택
                  </option>
                  <option value="male">남</option>
                  <option value="female">여</option>
                </AdminSelect>
              </Field>
              <Field label="이메일 (선택)">
                <input name="email" type="email" />
              </Field>
              <Field label="전화번호 (선택)">
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
              {rolesQuery.isError || userRolesQuery.isError ? (
                <p className="identity-form-error">
                  역할 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
                </p>
              ) : null}
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
                  const assignedRoleIds = userRolesQuery.data;
                  const checked =
                    required ||
                    (assignedRoleIds
                      ? assignedRoleIds.includes(role.id)
                      : (dialog.identity.value.roles ?? []).includes(role.name));
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

      {dialog?.type === 'activation' ? (
        <IdentityDialog
          title={`${displayIdentity(dialog.identity)} 인증코드 발급`}
          onClose={() => setDialog(null)}
        >
          <div className="identity-dialog-form">
            <p className="identity-field-note">발급된 코드는 한 번만 표시됩니다.</p>
            {issuedActivation ? (
              <div className="identity-activation-code" role="status">
                <span>인증코드</span>
                <div className="identity-activation-code__value">
                  <strong>{issuedActivation.code}</strong>
                  <button
                    type="button"
                    aria-label="인증코드 복사"
                    title="인증코드 복사"
                    onClick={() => {
                      if (!navigator.clipboard) return;
                      void navigator.clipboard
                        .writeText(issuedActivation.code)
                        .then(() =>
                          showToast({ title: '인증코드를 복사했습니다.', tone: 'success' }),
                        );
                    }}
                  >
                    <Copy size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}
            {issueActivation.isError ? (
              <p className="identity-form-error">
                인증코드를 발급하지 못했습니다. 번호 형식과 권한을 확인해 주세요.
              </p>
            ) : null}
            <footer className="identity-dialog-actions">
              <button
                className="identity-secondary-button"
                type="button"
                onClick={() => setDialog(null)}
              >
                닫기
              </button>
              <button
                className="identity-primary-button"
                type="button"
                disabled={issueActivation.isPending}
                onClick={() =>
                  issueActivation.mutate({
                    identityType: dialog.identity.kind,
                    identityNumber: identityNumber(dialog.identity),
                    schoolYear:
                      dialog.identity.kind === 'student'
                        ? dialog.identity.value.schoolYear
                        : undefined,
                    force: true,
                  })
                }
              >
                {issueActivation.isPending ? '발급 중' : issuedActivation ? '재발급' : '발급'}
              </button>
            </footer>
          </div>
        </IdentityDialog>
      ) : null}
    </div>
  );
}

function IdentityActions({
  identity,
  isLastRow,
  canManageRoles,
  canManageStatus,
  statusPending,
  onOpen,
  onUpdateStatus,
  onOpenActivation,
}: {
  identity: Identity;
  isLastRow: boolean;
  canManageRoles: boolean;
  canManageStatus: boolean;
  statusPending: boolean;
  onOpen: (state: DialogState) => void;
  onUpdateStatus: (identity: Identity, status: AdminUserStatus) => void;
  onOpenActivation: (identity: Identity) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const disabled = !identity.value.userId;
  const inactive =
    identity.kind === 'student'
      ? identity.value.status === 'graduated'
      : identity.value.status === 'deleted';
  const nextStatus: AdminUserStatus = identity.kind === 'student' ? 'graduated' : 'deleted';
  const deactivateLabel = identity.kind === 'student' ? '학적 종료' : '전근·퇴직 처리';

  const openActivation = () => {
    setMenuOpen(false);
    onOpenActivation(identity);
  };

  const openRoles = () => {
    setMenuOpen(false);
    onOpen({ type: 'roles', identity });
  };

  const requestStatusChange = () => {
    const subject =
      identity.kind === 'student'
        ? `${identity.value.studentNo} ${identity.value.name}`
        : `${identity.value.staffNo} ${identity.value.name}`;
    if (
      window.confirm(
        `${subject} 계정을 비활성화하고 연락처·프로필·인증정보를 즉시 파기하시겠습니까?`,
      )
    ) {
      setMenuOpen(false);
      onUpdateStatus(identity, nextStatus);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  return (
    <RowActions
      className="identity-row-actions"
      mobileChildren={
        <>
          <RowActionButton
            icon={<Pencil aria-hidden="true" />}
            label="정보 수정"
            onClick={() => onOpen({ type: 'edit', identity })}
          />
          <RowActionButton
            icon={<KeyRound aria-hidden="true" />}
            label="인증코드 발급"
            onClick={openActivation}
          />
          {canManageRoles ? (
            <RowActionButton
              icon={<ShieldCheck aria-hidden="true" />}
              label="역할 수정"
              disabled={disabled}
              onClick={openRoles}
            />
          ) : null}
          {canManageStatus && !inactive ? (
            <RowActionButton
              className="is-danger"
              icon={<ShieldAlert aria-hidden="true" />}
              label={deactivateLabel}
              variant="danger"
              disabled={disabled || statusPending}
              onClick={requestStatusChange}
            />
          ) : null}
        </>
      }
    >
      <RowActionButton
        icon={<Pencil aria-hidden="true" />}
        label="정보 수정"
        onClick={() => onOpen({ type: 'edit', identity })}
      />
      <div className={`identity-more-actions${isLastRow ? ' is-last-row' : ''}`} ref={menuRef}>
        <RowActionButton
          icon={<MoreHorizontal aria-hidden="true" />}
          label="더보기"
          onClick={() => setMenuOpen((current) => !current)}
        />
        {menuOpen ? (
          <div className="identity-more-actions__menu" role="menu">
            <button type="button" role="menuitem" onClick={openActivation}>
              <KeyRound aria-hidden="true" /> 인증코드 발급
            </button>
            {canManageRoles ? (
              <button type="button" role="menuitem" disabled={disabled} onClick={openRoles}>
                <ShieldCheck aria-hidden="true" /> 역할 수정
              </button>
            ) : null}
            {canManageStatus && !inactive ? (
              <button
                className="is-danger"
                type="button"
                role="menuitem"
                disabled={disabled || statusPending}
                onClick={requestStatusChange}
              >
                <ShieldAlert aria-hidden="true" /> {deactivateLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </RowActions>
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
            <>
              <input
                name="studentNoDisplay"
                defaultValue={identity.value.studentNo}
                inputMode="numeric"
                disabled
                aria-label="학번"
              />
              <input type="hidden" name="studentNo" value={identity.value.studentNo} />
            </>
          </Field>
          <Field label="이름">
            <input name="name" defaultValue={identity.value.name} required />
          </Field>
          <Field label="성별">
            <AdminSelect
              name="gender"
              defaultValue={identity.value.gender ?? ''}
              required
              aria-label="성별"
            >
              <option value="" disabled>
                선택
              </option>
              <option value="male">남</option>
              <option value="female">여</option>
            </AdminSelect>
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
          <Field label="성별">
            <AdminSelect
              name="gender"
              defaultValue={identity.value.gender ?? ''}
              required
              aria-label="성별"
            >
              <option value="" disabled>
                선택
              </option>
              <option value="male">남</option>
              <option value="female">여</option>
            </AdminSelect>
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

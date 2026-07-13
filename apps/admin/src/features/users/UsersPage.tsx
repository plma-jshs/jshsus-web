import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AdminStaffSummary, AdminStudentSummary } from '@jshsus/types';
import { School, UsersRound } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { api } from '../../shared/api/adminApi';

const studentColumns: ColumnDef<AdminStudentSummary>[] = [
  { accessorKey: 'studentNo', header: '학번' },
  { accessorKey: 'name', header: '성명' },
  { accessorKey: 'grade', header: '학년' },
  { accessorKey: 'classNo', header: '반' },
  { accessorKey: 'number', header: '번호' },
  { accessorKey: 'currentPoint', header: '상벌점' },
  {
    accessorKey: 'userId',
    header: '계정 연결',
    cell: ({ row }) => (row.original.userId ? `#${row.original.userId}` : '미연결'),
  },
];

const staffColumns: ColumnDef<AdminStaffSummary>[] = [
  { accessorKey: 'staffNo', header: '교직원 번호' },
  { accessorKey: 'name', header: '성명' },
  { accessorKey: 'department', header: '부서' },
  { accessorKey: 'title', header: '직책' },
  {
    accessorKey: 'isStudentAffairsHead',
    header: '학생부장',
    cell: ({ row }) => (row.original.isStudentAffairsHead ? '예' : '아니오'),
  },
];

export function UsersPage() {
  const queryClient = useQueryClient();
  const studentsQuery = useQuery({ queryKey: ['admin-students'], queryFn: api.adminStudents });
  const staffQuery = useQuery({ queryKey: ['admin-staff'], queryFn: api.adminStaff, retry: false });
  const rolesQuery = useQuery({ queryKey: ['iam-roles'], queryFn: api.iamRoles, retry: false });
  const [studentForm, setStudentForm] = useState({
    studentNo: '',
    name: '',
    grade: '1',
    classNo: '1',
    number: '1',
    initialPassword: '',
  });
  const [staffForm, setStaffForm] = useState({
    staffNo: '',
    name: '',
    department: '',
    title: '',
    isStudentAffairsHead: false,
    initialPassword: '',
  });
  const [selectedUserId, setSelectedUserId] = useState('');
  const userRolesQuery = useQuery({
    queryKey: ['admin-user-roles', selectedUserId],
    queryFn: () => api.userRoles(Number(selectedUserId)),
    enabled: Boolean(selectedUserId),
    retry: false,
  });
  const [roleSelection, setRoleSelection] = useState<{ userId: string; ids: number[] } | null>(
    null,
  );
  const selectedRoleIds =
    roleSelection?.userId === selectedUserId ? roleSelection.ids : (userRolesQuery.data ?? []);

  const refreshUsers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-students'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] }),
      queryClient.invalidateQueries({ queryKey: ['iam-roles'] }),
    ]);
  };

  const createStudentMutation = useMutation({
    mutationFn: api.createStudent,
    onSuccess: async () => {
      setStudentForm({
        studentNo: '',
        name: '',
        grade: '1',
        classNo: '1',
        number: '1',
        initialPassword: '',
      });
      await refreshUsers();
    },
  });
  const createStaffMutation = useMutation({
    mutationFn: api.createStaff,
    onSuccess: async () => {
      setStaffForm({
        staffNo: '',
        name: '',
        department: '',
        title: '',
        isStudentAffairsHead: false,
        initialPassword: '',
      });
      await refreshUsers();
    },
  });
  const assignRolesMutation = useMutation({
    mutationFn: () => api.assignUserRoles(Number(selectedUserId), selectedRoleIds),
    onSuccess: async () => {
      setRoleSelection(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-user-roles', selectedUserId] });
      await refreshUsers();
    },
  });

  const handleCreateStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createStudentMutation.mutate({
      studentNo: Number(studentForm.studentNo),
      name: studentForm.name,
      grade: Number(studentForm.grade),
      classNo: Number(studentForm.classNo),
      number: Number(studentForm.number),
      initialPassword: studentForm.initialPassword,
    });
  };

  const handleCreateStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createStaffMutation.mutate({
      staffNo: Number(staffForm.staffNo),
      name: staffForm.name,
      department: staffForm.department,
      title: staffForm.title,
      isStudentAffairsHead: staffForm.isStudentAffairsHead,
      initialPassword: staffForm.initialPassword,
    });
  };

  const toggleRole = (roleId: number) => {
    const ids = selectedRoleIds.includes(roleId)
      ? selectedRoleIds.filter((id) => id !== roleId)
      : [...selectedRoleIds, roleId];
    setRoleSelection({ userId: selectedUserId, ids });
  };

  return (
    <div className="admin-stack">
      <section className="metric-grid compact">
        <article className="metric-card">
          <School size={20} />
          <span>학생</span>
          <strong>{studentsQuery.data?.length ?? 0}</strong>
        </article>
        <article className="metric-card">
          <UsersRound size={20} />
          <span>교직원 프로필</span>
          <strong>{staffQuery.data?.length ?? 0}</strong>
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>학생 생성</h2>
        </div>
        <form className="admin-form-grid compact-form" onSubmit={handleCreateStudent}>
          <label>
            <span>학번</span>
            <input
              value={studentForm.studentNo}
              onChange={(event) =>
                setStudentForm((form) => ({ ...form, studentNo: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>이름</span>
            <input
              value={studentForm.name}
              onChange={(event) =>
                setStudentForm((form) => ({ ...form, name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>학년</span>
            <input
              type="number"
              value={studentForm.grade}
              onChange={(event) =>
                setStudentForm((form) => ({ ...form, grade: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>반</span>
            <input
              type="number"
              value={studentForm.classNo}
              onChange={(event) =>
                setStudentForm((form) => ({ ...form, classNo: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>번호</span>
            <input
              type="number"
              value={studentForm.number}
              onChange={(event) =>
                setStudentForm((form) => ({ ...form, number: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>초기 비밀번호</span>
            <input
              type="password"
              minLength={10}
              value={studentForm.initialPassword}
              onChange={(event) =>
                setStudentForm((form) => ({ ...form, initialPassword: event.target.value }))
              }
              autoComplete="new-password"
              required
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={createStudentMutation.isPending}
          >
            생성
          </button>
        </form>
        {createStudentMutation.isError ? (
          <p className="form-error">학생 생성에 실패했습니다.</p>
        ) : null}
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>교직원 생성</h2>
        </div>
        <form className="admin-form-grid compact-form" onSubmit={handleCreateStaff}>
          <label>
            <span>번호</span>
            <input
              value={staffForm.staffNo}
              onChange={(event) =>
                setStaffForm((form) => ({ ...form, staffNo: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>이름</span>
            <input
              value={staffForm.name}
              onChange={(event) => setStaffForm((form) => ({ ...form, name: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>부서</span>
            <input
              value={staffForm.department}
              onChange={(event) =>
                setStaffForm((form) => ({ ...form, department: event.target.value }))
              }
            />
          </label>
          <label>
            <span>직책</span>
            <input
              value={staffForm.title}
              onChange={(event) => setStaffForm((form) => ({ ...form, title: event.target.value }))}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={staffForm.isStudentAffairsHead}
              onChange={(event) =>
                setStaffForm((form) => ({ ...form, isStudentAffairsHead: event.target.checked }))
              }
            />
            <span>학생부장</span>
          </label>
          <label>
            <span>초기 비밀번호</span>
            <input
              type="password"
              minLength={10}
              value={staffForm.initialPassword}
              onChange={(event) =>
                setStaffForm((form) => ({ ...form, initialPassword: event.target.value }))
              }
              autoComplete="new-password"
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={createStaffMutation.isPending}>
            생성
          </button>
        </form>
        {createStaffMutation.isError ? (
          <p className="form-error">교직원 생성에 실패했습니다.</p>
        ) : null}
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>사용자 역할 부여</h2>
        </div>
        <div className="role-assignment">
          <label>
            <span>사용자</span>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">선택</option>
              {(studentsQuery.data ?? [])
                .filter((student) => student.userId)
                .map((student) => (
                  <option value={student.userId} key={`student-${student.id}`}>
                    {student.studentNo} {student.name}
                  </option>
                ))}
              {(staffQuery.data ?? []).map((staff) => (
                <option value={staff.userId} key={`staff-${staff.id}`}>
                  {staff.staffNo} {staff.name}
                </option>
              ))}
            </select>
          </label>
          <div className="check-grid">
            {(rolesQuery.data ?? []).map((role) => (
              <label key={role.id}>
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                />
                <span>{role.label}</span>
              </label>
            ))}
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => assignRolesMutation.mutate()}
            disabled={!selectedUserId || assignRolesMutation.isPending}
          >
            역할 저장
          </button>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>전체 학생</h2>
        </div>
        {studentsQuery.isError ? (
          <p className="form-error">학생 목록을 불러오지 못했습니다.</p>
        ) : null}
        <DataTable columns={studentColumns} data={studentsQuery.data ?? []} />
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>교직원 프로필</h2>
        </div>
        {staffQuery.isError ? (
          <p className="form-error">교직원 목록은 시스템 관리자 권한으로 확인할 수 있습니다.</p>
        ) : null}
        <DataTable columns={staffColumns} data={staffQuery.data ?? []} />
      </section>
    </div>
  );
}

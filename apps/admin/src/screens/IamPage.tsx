import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AdminPermissionSummary, AdminRoleSummary } from '@jshsus/types';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { api } from '../lib/api';

const roleColumns: ColumnDef<AdminRoleSummary>[] = [
  { accessorKey: 'name', header: '역할 키' },
  { accessorKey: 'label', header: '표시명' },
  { accessorKey: 'userCount', header: '사용자 수' },
  { accessorKey: 'permissionCount', header: '권한 수' },
];

const permissionColumns: ColumnDef<AdminPermissionSummary>[] = [
  { accessorKey: 'name', header: '권한 키' },
  { accessorKey: 'label', header: '표시명' },
  { accessorKey: 'description', header: '설명' },
];

export function IamPage() {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({ queryKey: ['iam-roles'], queryFn: api.iamRoles, retry: false });
  const permissionsQuery = useQuery({
    queryKey: ['iam-permissions'],
    queryFn: api.iamPermissions,
    retry: false,
  });
  const [roleForm, setRoleForm] = useState({ name: '', label: '' });
  const [permissionForm, setPermissionForm] = useState({ name: '', label: '', description: '' });
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const rolePermissionsQuery = useQuery({
    queryKey: ['role-permissions', selectedRoleId],
    queryFn: () => api.rolePermissions(Number(selectedRoleId)),
    enabled: Boolean(selectedRoleId),
  });
  const [permissionSelection, setPermissionSelection] = useState<{
    roleId: string;
    ids: number[];
  } | null>(null);
  const selectedPermissionIds =
    permissionSelection?.roleId === selectedRoleId
      ? permissionSelection.ids
      : (rolePermissionsQuery.data ?? []);

  const refreshIam = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['iam-roles'] }),
      queryClient.invalidateQueries({ queryKey: ['iam-permissions'] }),
      queryClient.invalidateQueries({ queryKey: ['role-permissions', selectedRoleId] }),
    ]);
  };

  const createRoleMutation = useMutation({
    mutationFn: api.createRole,
    onSuccess: async () => {
      setRoleForm({ name: '', label: '' });
      await refreshIam();
    },
  });
  const createPermissionMutation = useMutation({
    mutationFn: api.createPermission,
    onSuccess: async () => {
      setPermissionForm({ name: '', label: '', description: '' });
      await refreshIam();
    },
  });
  const assignPermissionsMutation = useMutation({
    mutationFn: () => api.assignRolePermissions(Number(selectedRoleId), selectedPermissionIds),
    onSuccess: async () => {
      setPermissionSelection(null);
      await refreshIam();
    },
  });

  const handleRoleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createRoleMutation.mutate(roleForm);
  };

  const handlePermissionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createPermissionMutation.mutate(permissionForm);
  };

  const togglePermission = (permissionId: number) => {
    const ids = selectedPermissionIds.includes(permissionId)
      ? selectedPermissionIds.filter((id) => id !== permissionId)
      : [...selectedPermissionIds, permissionId];
    setPermissionSelection({ roleId: selectedRoleId, ids });
  };

  return (
    <div className="admin-stack">
      <section className="metric-grid compact">
        <article className="metric-card">
          <KeyRound size={20} />
          <span>역할</span>
          <strong>{rolesQuery.data?.length ?? 0}</strong>
        </article>
        <article className="metric-card">
          <ShieldCheck size={20} />
          <span>권한 항목</span>
          <strong>
            {(rolesQuery.data ?? []).reduce((sum, role) => sum + role.permissionCount, 0)}
          </strong>
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>IAM 역할 요약</h2>
        </div>
        {rolesQuery.isError ? (
          <p className="form-error">IAM 역할은 시스템 관리자 권한으로 확인할 수 있습니다.</p>
        ) : null}
        <DataTable columns={roleColumns} data={rolesQuery.data ?? []} />
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>역할 생성</h2>
        </div>
        <form className="admin-form-grid compact-form" onSubmit={handleRoleSubmit}>
          <label>
            <span>역할 키</span>
            <input
              value={roleForm.name}
              onChange={(event) => setRoleForm((form) => ({ ...form, name: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>표시명</span>
            <input
              value={roleForm.label}
              onChange={(event) => setRoleForm((form) => ({ ...form, label: event.target.value }))}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={createRoleMutation.isPending}>
            생성
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>권한 생성</h2>
        </div>
        <form className="admin-form-grid compact-form" onSubmit={handlePermissionSubmit}>
          <label>
            <span>권한 키</span>
            <input
              value={permissionForm.name}
              onChange={(event) =>
                setPermissionForm((form) => ({ ...form, name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>표시명</span>
            <input
              value={permissionForm.label}
              onChange={(event) =>
                setPermissionForm((form) => ({ ...form, label: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>설명</span>
            <input
              value={permissionForm.description}
              onChange={(event) =>
                setPermissionForm((form) => ({ ...form, description: event.target.value }))
              }
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={createPermissionMutation.isPending}
          >
            생성
          </button>
        </form>
        <DataTable columns={permissionColumns} data={permissionsQuery.data ?? []} />
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>역할별 권한 부여</h2>
        </div>
        <div className="role-assignment">
          <label>
            <span>역할</span>
            <select
              value={selectedRoleId}
              onChange={(event) => setSelectedRoleId(event.target.value)}
            >
              <option value="">선택</option>
              {(rolesQuery.data ?? []).map((role) => (
                <option value={role.id} key={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <div className="check-grid">
            {(permissionsQuery.data ?? []).map((permission) => (
              <label key={permission.id}>
                <input
                  type="checkbox"
                  checked={selectedPermissionIds.includes(permission.id)}
                  onChange={() => togglePermission(permission.id)}
                />
                <span>{permission.label}</span>
              </label>
            ))}
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => assignPermissionsMutation.mutate()}
            disabled={!selectedRoleId || assignPermissionsMutation.isPending}
          >
            권한 저장
          </button>
        </div>
      </section>
    </div>
  );
}

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminRoleSummary } from '@jshsus/types';
import { Pencil, Plus } from 'lucide-react';
import { Dialog, useToast } from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import './iam.css';

const BUILT_IN_ROLES = new Set([
  'system_admin',
  'student_affairs_head',
  'teacher',
  'student_council',
  'broadcast_club',
  'student',
]);

const ROLE_ORDER = [
  'student',
  'teacher',
  'student_council',
  'broadcast_club',
  'student_affairs_head',
  'system_admin',
] as const;

const roleOrder = new Map(ROLE_ORDER.map((name, index) => [name, index]));

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="iam-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function IamPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const rolesQuery = useQuery({ queryKey: ['iam-roles'], queryFn: api.iamRoles, retry: false });
  const permissionsQuery = useQuery({
    queryKey: ['iam-permissions'],
    queryFn: api.iamPermissions,
    retry: false,
  });
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ roleId: number; ids: number[] } | null>(null);
  const [dialog, setDialog] = useState<'create' | { edit: AdminRoleSummary } | null>(null);

  const sortedRoles = useMemo(
    () =>
      [...(rolesQuery.data ?? [])].sort((left, right) => {
        const leftOrder = roleOrder.get(left.name as (typeof ROLE_ORDER)[number]);
        const rightOrder = roleOrder.get(right.name as (typeof ROLE_ORDER)[number]);
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      }),
    [rolesQuery.data],
  );
  const effectiveRoleId = selectedRoleId ?? sortedRoles[0]?.id ?? null;
  const selectedRole = useMemo(
    () => rolesQuery.data?.find((role) => role.id === effectiveRoleId),
    [rolesQuery.data, effectiveRoleId],
  );
  const isSystemAdminRole = selectedRole?.name === 'system_admin';
  const rolePermissionsQuery = useQuery({
    queryKey: ['role-permissions', effectiveRoleId],
    queryFn: () => api.rolePermissions(effectiveRoleId!),
    enabled: Boolean(effectiveRoleId),
  });
  const selectedIds = isSystemAdminRole
    ? (permissionsQuery.data?.map((permission) => permission.id) ?? [])
    : draft?.roleId === effectiveRoleId
      ? draft.ids
      : (rolePermissionsQuery.data ?? []);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['iam-roles'] }),
      queryClient.invalidateQueries({ queryKey: ['iam-permissions'] }),
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] }),
    ]);
  };
  const createRole = useMutation({
    mutationFn: api.createRole,
    onSuccess: async (result) => {
      setDialog(null);
      await refresh();
      setSelectedRoleId(result.role.id);
      showToast({ title: '역할을 추가했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '역할을 추가하지 못했습니다.', tone: 'danger' }),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, input }: { id: number; input: { name?: string; label?: string } }) =>
      api.updateRole(id, input),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      showToast({ title: '역할 정보를 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '역할 정보를 저장하지 못했습니다.', tone: 'danger' }),
  });
  const assignPermissions = useMutation({
    mutationFn: () => api.assignRolePermissions(effectiveRoleId!, selectedIds),
    onSuccess: async () => {
      setDraft(null);
      await refresh();
      showToast({ title: '권한 정책을 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '권한 정책을 저장하지 못했습니다.', tone: 'danger' }),
  });

  const submitRole = (event: FormEvent<HTMLFormElement>, role?: AdminRoleSummary) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { name: String(form.get('name')), label: String(form.get('label')) };
    if (role) updateRole.mutate({ id: role.id, input });
    else createRole.mutate(input);
  };

  return (
    <div className="iam-page">
      <section className="iam-panel">
        <header className="iam-panel-header">
          <div>
            <h2>역할 정책</h2>
            <span>{rolesQuery.data?.length ?? 0}개 역할</span>
          </div>
          <button className="iam-primary" type="button" onClick={() => setDialog('create')}>
            <Plus size={17} /> 역할 추가
          </button>
        </header>
        {rolesQuery.isError ? <p className="iam-error">역할 목록을 불러오지 못했습니다.</p> : null}
        <div className="iam-policy-layout">
          <nav className="iam-role-list" aria-label="역할 목록">
            {sortedRoles.map((role) => (
              <button
                type="button"
                key={role.id}
                className={role.id === effectiveRoleId ? 'active' : ''}
                onClick={() => {
                  setSelectedRoleId(role.id);
                  setDraft(null);
                }}
              >
                <span>
                  <strong>{role.label}</strong>
                  <small>{role.name}</small>
                </span>
                <em>{role.userCount}명</em>
              </button>
            ))}
          </nav>
          <div className="iam-matrix">
            {selectedRole ? (
              <div className="iam-matrix-title">
                <div>
                  <h3>{selectedRole.label}</h3>
                  <span>{selectedRole.name}</span>
                  {isSystemAdminRole ? (
                    <em className="iam-full-access-note">항상 전체 권한</em>
                  ) : null}
                </div>
                <button
                  className="iam-icon-button"
                  type="button"
                  onClick={() => setDialog({ edit: selectedRole })}
                  aria-label="역할 수정"
                >
                  <Pencil size={16} />
                </button>
              </div>
            ) : null}
            <div className="iam-matrix-table-wrap">
              <table className="iam-table">
                <thead>
                  <tr>
                    <th>권한</th>
                    <th>권한 키</th>
                    <th>부여</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionsQuery.isPending || rolePermissionsQuery.isPending ? (
                    <tr>
                      <td colSpan={3} className="iam-empty">
                        불러오는 중입니다.
                      </td>
                    </tr>
                  ) : (permissionsQuery.data?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={3} className="iam-empty">
                        등록된 권한이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    permissionsQuery.data?.map((permission) => (
                      <tr key={permission.id}>
                        <td className="align-left">
                          <strong>{permission.label}</strong>
                        </td>
                        <td className="align-left code">{permission.name}</td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${permission.label} 부여`}
                            checked={isSystemAdminRole || selectedIds.includes(permission.id)}
                            disabled={isSystemAdminRole}
                            onChange={() =>
                              !isSystemAdminRole &&
                              setDraft({
                                roleId: effectiveRoleId!,
                                ids: selectedIds.includes(permission.id)
                                  ? selectedIds.filter((id) => id !== permission.id)
                                  : [...selectedIds, permission.id],
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <footer className="iam-matrix-actions">
              <span>
                {isSystemAdminRole ? '항상 전체 권한' : `${selectedIds.length}개 권한 선택`}
              </span>
              <button
                className="iam-primary"
                type="button"
                onClick={() => assignPermissions.mutate()}
                disabled={
                  isSystemAdminRole || !effectiveRoleId || !draft || assignPermissions.isPending
                }
              >
                {assignPermissions.isPending ? '저장 중' : '권한 저장'}
              </button>
            </footer>
            {assignPermissions.isError ? (
              <p className="iam-error">권한 정책을 저장하지 못했습니다.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="iam-panel">
        <header className="iam-panel-header">
          <div>
            <h2>권한 카탈로그</h2>
            <span>권한 키는 코드와 마이그레이션에서만 관리합니다.</span>
          </div>
        </header>
        <div className="iam-catalog-wrap">
          <table className="iam-table">
            <thead>
              <tr>
                <th>권한 키</th>
                <th>표시명</th>
                <th>설명</th>
              </tr>
            </thead>
            <tbody>
              {permissionsQuery.isPending ? (
                <tr>
                  <td colSpan={3} className="iam-empty">
                    불러오는 중입니다.
                  </td>
                </tr>
              ) : (permissionsQuery.data?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={3} className="iam-empty">
                    등록된 권한이 없습니다.
                  </td>
                </tr>
              ) : (
                permissionsQuery.data?.map((permission) => (
                  <tr key={permission.id}>
                    <td className="align-left code">{permission.name}</td>
                    <td>{permission.label}</td>
                    <td className="align-left description">{permission.description || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialog === 'create' ? (
        <Dialog open title="역할 추가" size="sm" onClose={() => setDialog(null)}>
          <form className="iam-dialog-form" onSubmit={(event) => submitRole(event)}>
            <Field label="역할 키">
              <input name="name" pattern="[a-z][a-z0-9_]*" placeholder="example_role" required />
            </Field>
            <Field label="표시명">
              <input name="label" required />
            </Field>
            {createRole.isError ? (
              <p className="iam-error">
                역할을 생성하지 못했습니다. 역할 키 중복 여부를 확인해 주세요.
              </p>
            ) : null}
            <DialogActions pending={createRole.isPending} onClose={() => setDialog(null)} />
          </form>
        </Dialog>
      ) : null}
      {dialog && typeof dialog === 'object' ? (
        <Dialog open title="역할 수정" size="sm" onClose={() => setDialog(null)}>
          <form className="iam-dialog-form" onSubmit={(event) => submitRole(event, dialog.edit)}>
            <Field label="역할 키">
              <input
                name="name"
                defaultValue={dialog.edit.name}
                readOnly={BUILT_IN_ROLES.has(dialog.edit.name)}
                required
              />
            </Field>
            <Field label="표시명">
              <input name="label" defaultValue={dialog.edit.label} required />
            </Field>
            {BUILT_IN_ROLES.has(dialog.edit.name) ? (
              <p className="iam-note">기본 역할의 키는 변경할 수 없습니다.</p>
            ) : null}
            {updateRole.isError ? <p className="iam-error">역할을 수정하지 못했습니다.</p> : null}
            <DialogActions pending={updateRole.isPending} onClose={() => setDialog(null)} />
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function DialogActions({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return (
    <footer className="iam-dialog-actions">
      <button className="iam-secondary" type="button" onClick={onClose}>
        취소
      </button>
      <button className="iam-primary" type="submit" disabled={pending}>
        {pending ? '저장 중' : '저장'}
      </button>
    </footer>
  );
}

import type { PointReason } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import {
  AdminSelect,
  AdminListPanel,
  AdminSearchField,
  Button,
  Dialog,
  DialogActions,
  FormField,
  MobileSortSelect,
  RowActionButton,
  RowActions,
  TableSummary,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { pointsApi, type PointReasonRow } from './pointsApi';
import './points.css';

const typeLabel: Record<PointReason['type'], string> = {
  PLUS: '상점',
  MINUS: '벌점',
  ETC: '기타',
};

type EditorState = { mode: 'create' } | { mode: 'edit'; reason: PointReasonRow };
type ReasonSort = 'id' | 'comment' | 'point';

export function PointReasonsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<PointReason['type'] | ''>('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'id', desc: false }]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PointReasonRow | null>(null);
  const [form, setForm] = useState<{ type: PointReason['type']; point: string; comment: string }>({
    type: 'PLUS',
    point: '1',
    comment: '',
  });
  const sort = sorting[0];

  const reasonsQuery = useQuery({
    queryKey: ['point-reason-page', page, pageSize, search, type, sort?.id, sort?.desc],
    queryFn: () =>
      pointsApi.reasonPage({
        page,
        pageSize,
        search: search || undefined,
        type: type || undefined,
        sortBy: (sort?.id as ReasonSort | undefined) ?? 'id',
        sortOrder: sort?.desc ? 'desc' : 'asc',
      }),
  });
  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        type: form.type,
        point: Number(form.point),
        comment: form.comment,
      };
      return editor?.mode === 'edit'
        ? pointsApi.updateReason(editor.reason.id, body)
        : pointsApi.createReason(body);
    },
    onSuccess: async () => {
      showToast({
        title: editor?.mode === 'edit' ? '사유 수정 완료' : '사유 추가 완료',
        description: form.comment.trim(),
        tone: 'success',
      });
      setEditor(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['point-reason-page'] }),
        queryClient.invalidateQueries({ queryKey: ['point-reasons'] }),
      ]);
    },
    onError: (error) => {
      showToast({
        title: '사유를 저장하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (reason: PointReasonRow) => pointsApi.updateReason(reason.id, { isActive: false }),
    onSuccess: async () => {
      showToast({
        title: '사유 삭제 완료',
        description: deleteTarget?.comment,
        tone: 'success',
      });
      setDeleteTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['point-reason-page'] }),
        queryClient.invalidateQueries({ queryKey: ['point-reasons'] }),
      ]);
    },
    onError: (error) => {
      showToast({
        title: '사유를 삭제하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      });
    },
  });

  const openCreate = () => {
    setForm({ type: 'PLUS', point: '1', comment: '' });
    setEditor({ mode: 'create' });
  };
  const openEdit = (reason: PointReasonRow) => {
    setForm({ type: reason.type, point: String(reason.point), comment: reason.comment });
    setEditor({ mode: 'edit', reason });
  };

  const renderReasonActions = (reason: PointReasonRow) =>
    reason.isSystem ? null : (
      <RowActions>
        <RowActionButton
          icon={<Pencil size={15} aria-hidden="true" />}
          label={`${reason.comment} 수정`}
          variant="secondary"
          onClick={() => openEdit(reason)}
        />
        <RowActionButton
          icon={<Trash2 size={15} aria-hidden="true" />}
          label={`${reason.comment} 삭제`}
          variant="danger"
          onClick={() => setDeleteTarget(reason)}
        />
      </RowActions>
    );

  const columns: ColumnDef<PointReasonRow>[] = [
    {
      accessorKey: 'id',
      header: '사유코드',
      cell: ({ row }) => row.original.id,
      meta: { align: 'center', width: 120 },
    },
    {
      accessorKey: 'type',
      header: '종류',
      enableSorting: false,
      cell: ({ row }) => typeLabel[row.original.type],
      meta: { align: 'center', width: 120 },
    },
    {
      accessorKey: 'comment',
      header: '사유',
      enableSorting: false,
      meta: { minWidth: 260 },
    },
    {
      accessorKey: 'point',
      header: '점수',
      cell: ({ row }) => `${row.original.point > 0 ? '+' : ''}${row.original.point}`,
      meta: { align: 'right', width: 120 },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => renderReasonActions(row.original),
      meta: { align: 'center', width: 92 },
    },
  ];

  const resetPage = () => setPage(1);

  return (
    <>
      <AdminListPanel
        className="point-panel"
        toolbar={
          <TableToolbar
            summary={
              <TableSummary
                count={reasonsQuery.data?.total}
                suffix="건"
                loading={reasonsQuery.isPending}
              />
            }
            mobileSearch={
              <AdminSearchField
                className="point-filter point-filter--search"
                aria-label="사유 검색"
                value={search}
                placeholder="사유 또는 사유코드"
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                onClear={() => {
                  setSearch('');
                  resetPage();
                }}
              />
            }
            mobileActions={
              <Button variant="primary" onClick={openCreate}>
                사유 추가
              </Button>
            }
            mobileSort={
              <MobileSortSelect
                value={`${sort?.id ?? 'id'}:${sort?.desc ? 'desc' : 'asc'}`}
                options={[
                  { value: 'id:asc', label: '코드순' },
                  { value: 'comment:asc', label: '가나다순' },
                  { value: 'point:desc', label: '점수 높은순' },
                ]}
                onChange={(value) => {
                  const [id, direction] = value.split(':');
                  setSorting([{ id: id ?? 'point', desc: direction === 'desc' }]);
                  resetPage();
                }}
              />
            }
          >
            <label className="point-filter">
              <AdminSelect
                aria-label="종류"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as PointReason['type'] | '');
                  resetPage();
                }}
              >
                <option value="">전체 유형</option>
                <option value="PLUS">상점</option>
                <option value="MINUS">벌점</option>
                <option value="ETC">기타</option>
              </AdminSelect>
            </label>
          </TableToolbar>
        }
      >
        <DataTable
          columns={columns}
          data={reasonsQuery.data?.items ?? []}
          loading={reasonsQuery.isLoading}
          emptyText={reasonsQuery.isError ? reasonsQuery.error.message : '등록된 사유가 없습니다.'}
          sorting={sorting}
          onSortingChange={(updater) => {
            setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
            resetPage();
          }}
          manualSorting
          pagination={{
            pageIndex: page - 1,
            pageSize,
            pageCount: reasonsQuery.data?.totalPages ?? 1,
            totalCount: reasonsQuery.data?.total,
            onPageChange: (nextPage) => setPage(nextPage + 1),
            onPageSizeChange: (nextPageSize) => {
              setPageSize(nextPageSize);
              resetPage();
            },
          }}
          alwaysShowPagination
          getRowId={(row) => String(row.id)}
          renderMobileRow={(reason) => (
            <article className="point-reason-mobile-card">
              <header>
                <div>
                  <span className={`point-reason-type is-${reason.type.toLowerCase()}`}>
                    {typeLabel[reason.type]}
                  </span>
                  <strong>{reason.comment}</strong>
                </div>
                {renderReasonActions(reason)}
              </header>
              <footer>
                <strong className={reason.point < 0 ? 'point-value--danger' : undefined}>
                  {reason.point > 0 ? '+' : ''}
                  {reason.point}점
                </strong>
                {reason.isSystem ? <span>기본 규정</span> : null}
              </footer>
            </article>
          )}
        />
      </AdminListPanel>

      <Dialog
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? '사유 수정' : '사유 추가'}
        footer={
          <DialogActions
            onClose={() => setEditor(null)}
            onConfirm={() => saveMutation.mutate()}
            confirmDisabled={!form.comment.trim() || Number.isNaN(Number(form.point))}
            pending={saveMutation.isPending}
            confirmType="button"
          />
        }
      >
        <div className="point-dialog-form">
          <div className="point-dialog-fields-row">
            <FormField label="종류" required>
              <AdminSelect
                value={form.type}
                onChange={(event) => {
                  const nextType = event.target.value as PointReason['type'];
                  setForm((current) => ({
                    ...current,
                    type: nextType,
                    point: nextType === 'MINUS' ? '-1' : '1',
                  }));
                }}
              >
                <option value="PLUS">상점</option>
                <option value="MINUS">벌점</option>
                <option value="ETC">기타</option>
              </AdminSelect>
            </FormField>
            <FormField label="점수" required>
              <input
                type="number"
                min={-100}
                max={100}
                value={form.point}
                onChange={(event) =>
                  setForm((current) => ({ ...current, point: event.target.value }))
                }
              />
            </FormField>
          </div>
          <FormField label="사유" required error={saveMutation.error?.message}>
            <input
              value={form.comment}
              maxLength={255}
              autoFocus
              onChange={(event) =>
                setForm((current) => ({ ...current, comment: event.target.value }))
              }
            />
          </FormField>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="사유 삭제"
        description={deleteTarget?.comment}
        size="sm"
        footer={
          <DialogActions
            onClose={() => setDeleteTarget(null)}
            onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            confirmLabel="삭제"
            confirmVariant="danger"
            pending={deleteMutation.isPending}
            pendingLabel="삭제 중"
            confirmType="button"
          />
        }
      >
        <p className="point-dialog-copy">
          과거 기록은 유지되며 삭제한 사유는 새 상벌점 부여에서 표시하지 않습니다.
        </p>
      </Dialog>
    </>
  );
}

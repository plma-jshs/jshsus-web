import type { PointReason } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import {
  AdminListPanel,
  Button,
  Dialog,
  FormField,
  PageSizeSelect,
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
type ReasonSort = 'id' | 'point';

export function PointReasonsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<PointReason['type'] | ''>('');
  const [sorting, setSorting] = useState<SortingState>([]);
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

  const columns = useMemo<ColumnDef<PointReasonRow>[]>(
    () => [
      {
        id: 'id',
        header: '사유코드',
        cell: ({ row }) => row.original.legacyReasonCode ?? row.original.id,
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
        meta: { align: 'center', width: 120 },
      },
      {
        id: 'actions',
        header: '작업',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isSystem ? (
            <span className="point-system-label">시스템 기본값</span>
          ) : (
            <div className="point-table-actions">
              <Button
                className="point-action point-action--edit"
                size="sm"
                variant="ghost"
                title="수정"
                aria-label={`${row.original.comment} 수정`}
                onClick={() => openEdit(row.original)}
              >
                <Pencil size={15} aria-hidden="true" />
                수정
              </Button>
              <Button
                className="point-action point-action--delete"
                size="sm"
                variant="ghost"
                title="삭제"
                aria-label={`${row.original.comment} 삭제`}
                onClick={() => setDeleteTarget(row.original)}
              >
                <Trash2 size={15} aria-hidden="true" />
                삭제
              </Button>
            </div>
          ),
        meta: { align: 'center', width: 150 },
      },
    ],
    [],
  );

  const resetPage = () => setPage(1);

  return (
    <>
      <AdminListPanel
        className="point-panel"
        toolbar={
          <TableToolbar summary={reasonsQuery.data ? `총 ${reasonsQuery.data.total}건` : undefined}>
            <label className="point-filter point-filter--search">
              <span>검색</span>
              <input
                value={search}
                placeholder="사유 또는 사유코드"
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
              />
            </label>
            <label className="point-filter">
              <span>종류</span>
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as PointReason['type'] | '');
                  resetPage();
                }}
              >
                <option value="">전체</option>
                <option value="PLUS">상점</option>
                <option value="MINUS">벌점</option>
                <option value="ETC">기타</option>
              </select>
            </label>
            <PageSizeSelect
              value={pageSize}
              onChange={(value) => {
                setPageSize(value);
                resetPage();
              }}
            />
            <Button variant="primary" onClick={openCreate}>
              사유 추가
            </Button>
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
          }}
          alwaysShowPagination
          getRowId={(row) => String(row.id)}
        />
      </AdminListPanel>

      <Dialog
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? '사유 수정' : '사유 추가'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              disabled={!form.comment.trim() || Number.isNaN(Number(form.point))}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              저장
            </Button>
          </>
        }
      >
        <div className="point-dialog-form">
          <FormField label="종류" required>
            <select
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
            </select>
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
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              삭제
            </Button>
          </>
        }
      >
        <p className="point-dialog-copy">
          과거 기록은 유지되며 삭제한 사유는 새 상벌점 부여에서 표시하지 않습니다.
        </p>
      </Dialog>
    </>
  );
}

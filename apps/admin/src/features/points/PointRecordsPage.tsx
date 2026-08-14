import type { PointReason } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  AdminSelect,
  AdminListPanel,
  DateRangeField,
  MobileSortSelect,
  SelectedRowsHeaderAction,
  TableSelectionCheckbox,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { pointsApi, type PointRecordRow } from './pointsApi';
import { formatKoreanDate } from '../../shared/lib/date';
import './points.css';

const reasonTypeLabel: Record<PointReason['type'], string> = {
  PLUS: '상점',
  MINUS: '벌점',
  ETC: '기타',
};

type RecordSort = 'baseDate' | 'createdAt' | 'studentNo' | 'studentName' | 'point' | 'teacherName';

function formatCreatedAt(value: string) {
  return formatKoreanDate(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function PointRecordsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get('search') ?? '',
  );
  const [type, setType] = useState<PointReason['type'] | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<number>>(() => new Set());
  const [sorting, setSorting] = useState<SortingState>([{ id: 'baseDate', desc: true }]);
  const sort = sorting[0];
  const recordsQuery = useQuery({
    queryKey: ['point-record-page', page, pageSize, search, type, from, to, sort?.id, sort?.desc],
    queryFn: () =>
      pointsApi.records({
        page,
        pageSize,
        search: search || undefined,
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
        sortBy: (sort?.id as RecordSort | undefined) ?? 'baseDate',
        sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : 'desc',
      }),
  });

  const visibleRecordIds = useMemo(
    () => recordsQuery.data?.items.map((record) => record.id) ?? [],
    [recordsQuery.data?.items],
  );
  const allVisibleRecordsSelected =
    visibleRecordIds.length > 0 && visibleRecordIds.every((id) => selectedRecordIds.has(id));
  const someVisibleRecordsSelected = visibleRecordIds.some((id) => selectedRecordIds.has(id));
  const selectedCount = visibleRecordIds.filter((id) => selectedRecordIds.has(id)).length;

  const cancelSelectedMutation = useMutation({
    mutationFn: (ids: number[]) => pointsApi.cancelRecords(ids),
    onSuccess: async (result) => {
      setSelectedRecordIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['point-record-page'] });
      showToast({
        title: `상벌점 기록 ${result.canceled}건을 삭제했습니다.`,
        tone: 'success',
      });
    },
    onError: (error) => {
      showToast({
        title: '선택한 상벌점 기록을 삭제하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      });
    },
  });

  const toggleVisibleRecords = useCallback(
    (checked: boolean) => {
      setSelectedRecordIds(checked ? new Set(visibleRecordIds) : new Set());
    },
    [visibleRecordIds],
  );

  const toggleRecord = useCallback((id: number, checked: boolean) => {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const deleteSelectedRecords = useCallback(() => {
    const ids = visibleRecordIds.filter((id) => selectedRecordIds.has(id));
    if (ids.length === 0 || cancelSelectedMutation.isPending) return;
    const confirmed = window.confirm(
      `선택한 상벌점 기록 ${ids.length}건을 삭제하시겠습니까?\n삭제하면 학생 점수에서 제외되고 감사 로그에 남습니다.`,
    );
    if (!confirmed) return;
    cancelSelectedMutation.mutate(ids);
  }, [cancelSelectedMutation, selectedRecordIds, visibleRecordIds]);

  const applyRecordSearch = useCallback((value: number | string) => {
    const nextSearch = String(value);
    setSearch(nextSearch);
    setPage(1);
    setSelectedRecordIds(new Set());

    const params = new URLSearchParams(window.location.search);
    if (nextSearch) params.set('search', nextSearch);
    else params.delete('search');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  const columns = useMemo<ColumnDef<PointRecordRow>[]>(
    () => [
      {
        id: 'selection',
        header: () => (
          <label className="point-record-selection-label">
            <TableSelectionCheckbox
              label="현재 페이지 전체 선택"
              checked={allVisibleRecordsSelected}
              indeterminate={someVisibleRecordsSelected && !allVisibleRecordsSelected}
              disabled={visibleRecordIds.length === 0 || cancelSelectedMutation.isPending}
              onChange={toggleVisibleRecords}
            />
          </label>
        ),
        cell: ({ row }) => (
          <TableSelectionCheckbox
            label={`${row.original.studentName} 상벌점 기록 선택`}
            checked={selectedRecordIds.has(row.original.id)}
            disabled={cancelSelectedMutation.isPending}
            onChange={(checked) => toggleRecord(row.original.id, checked)}
          />
        ),
        enableSorting: false,
        meta: { align: 'center', width: 72 },
      },
      {
        accessorKey: 'baseDate',
        header: () => (
          <SelectedRowsHeaderAction
            selectedCount={selectedCount}
            defaultLabel="기준일"
            loading={cancelSelectedMutation.isPending}
            onDelete={deleteSelectedRecords}
          />
        ),
        enableSorting: selectedCount === 0,
        meta: { align: 'center', width: 130 },
      },
      {
        accessorKey: 'createdAt',
        header: '생성일시',
        cell: ({ row }) => formatCreatedAt(row.original.createdAt),
        meta: { align: 'center', width: 180 },
      },
      {
        accessorKey: 'studentNo',
        header: '학번',
        cell: ({ row }) => (
          <a
            className="point-table-link"
            href={`/points/records?search=${encodeURIComponent(String(row.original.studentNo))}`}
            onClick={(event) => {
              event.preventDefault();
              applyRecordSearch(row.original.studentNo);
            }}
          >
            {row.original.studentNo}
          </a>
        ),
        meta: { align: 'center', width: 110 },
      },
      {
        accessorKey: 'studentName',
        header: '이름',
        meta: { align: 'left', width: 120 },
      },
      {
        accessorKey: 'reasonType',
        header: '종류',
        enableSorting: false,
        cell: ({ row }) => reasonTypeLabel[row.original.reasonType],
        meta: { align: 'center', width: 100 },
      },
      {
        id: 'reasonText',
        accessorFn: (row) => row.reason,
        header: '사유',
        enableSorting: false,
        meta: { minWidth: 260, maxWidth: 420, truncate: true },
      },
      {
        accessorKey: 'point',
        header: '점수',
        cell: ({ row }) => (
          <span className={row.original.point < 0 ? 'point-value--danger' : ''}>
            {row.original.point > 0 ? '+' : ''}
            {row.original.point}
          </span>
        ),
        meta: { align: 'right', width: 90 },
      },
      {
        accessorKey: 'teacherName',
        header: '처리자',
        meta: { align: 'left', width: 140 },
      },
    ],
    [
      allVisibleRecordsSelected,
      applyRecordSearch,
      cancelSelectedMutation.isPending,
      deleteSelectedRecords,
      selectedRecordIds,
      selectedCount,
      someVisibleRecordsSelected,
      toggleRecord,
      toggleVisibleRecords,
      visibleRecordIds.length,
    ],
  );

  const resetPage = () => {
    setPage(1);
    setSelectedRecordIds(new Set());
  };

  return (
    <AdminListPanel
      className="point-panel"
      toolbar={
        <TableToolbar
          summary={
            recordsQuery.data ? (
              <div className="point-record-summary">
                <span>총 {recordsQuery.data.total}건</span>
                {selectedCount > 0 ? (
                  <button
                    className="point-record-mobile-delete"
                    type="button"
                    onClick={deleteSelectedRecords}
                    disabled={cancelSelectedMutation.isPending}
                  >
                    선택 {selectedCount}건 삭제
                  </button>
                ) : null}
              </div>
            ) : undefined
          }
          mobileSearch={
            <label className="point-filter point-filter--search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">검색</span>
              <input
                value={search}
                placeholder="학번, 이름, 사유 또는 처리자"
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
              />
            </label>
          }
          mobileSort={
            <MobileSortSelect
              value={`${sort?.id ?? 'baseDate'}:${sort?.desc ? 'desc' : 'asc'}`}
              options={[
                { value: 'baseDate:desc', label: '기준일 최신순' },
                { value: 'baseDate:asc', label: '기준일 오래된순' },
                { value: 'studentNo:asc', label: '학번 오름차순' },
                { value: 'studentNo:desc', label: '학번 내림차순' },
                { value: 'point:asc', label: '점수 낮은순' },
                { value: 'point:desc', label: '점수 높은순' },
              ]}
              onChange={(value) => {
                const [id, direction] = value.split(':');
                setSorting([{ id: id ?? 'baseDate', desc: direction === 'desc' }]);
                resetPage();
              }}
            />
          }
        >
          <label className="point-filter">
            <span>종류</span>
            <AdminSelect
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
            </AdminSelect>
          </label>
          <DateRangeField
            label="기준일"
            from={from}
            to={to}
            onFromChange={(value) => {
              setFrom(value);
              resetPage();
            }}
            onToChange={(value) => {
              setTo(value);
              resetPage();
            }}
          />
        </TableToolbar>
      }
    >
      <DataTable
        columns={columns}
        data={recordsQuery.data?.items ?? []}
        loading={recordsQuery.isLoading}
        emptyText={recordsQuery.isError ? recordsQuery.error.message : '조회된 기록이 없습니다.'}
        sorting={sorting}
        onSortingChange={(updater) => {
          setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
          resetPage();
        }}
        manualSorting
        pagination={{
          pageIndex: page - 1,
          pageSize,
          pageCount: recordsQuery.data?.totalPages ?? 1,
          totalCount: recordsQuery.data?.total,
          onPageChange: (nextPage) => {
            setPage(nextPage + 1);
            setSelectedRecordIds(new Set());
          },
          onPageSizeChange: (nextPageSize) => {
            setPageSize(nextPageSize);
            resetPage();
          },
        }}
        alwaysShowPagination
        getRowId={(row) => String(row.id)}
        renderMobileRow={(record) => (
          <article className="point-record-card">
            <header>
              <TableSelectionCheckbox
                label={`${record.studentName} 상벌점 기록 선택`}
                checked={selectedRecordIds.has(record.id)}
                disabled={cancelSelectedMutation.isPending}
                onChange={(checked) => toggleRecord(record.id, checked)}
              />
              <strong>
                {record.studentNo} {record.studentName}
              </strong>
              <div className={`point-record-card__score is-${record.reasonType.toLowerCase()}`}>
                <span>{reasonTypeLabel[record.reasonType]}</span>
                <strong>
                  {record.point > 0 ? '+' : ''}
                  {record.point}점
                </strong>
              </div>
            </header>
            <p className="point-record-card__reason">{record.reason}</p>
            <footer>
              {record.baseDate} · 처리자: {record.teacherName || '-'}
            </footer>
          </article>
        )}
      />
    </AdminListPanel>
  );
}

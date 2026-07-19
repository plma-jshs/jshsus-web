import type { PointReason } from '@jshsus/types';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { AdminListPanel, DateRangeField, PageSizeSelect, TableToolbar } from '../../components/ui';
import { pointsApi, type PointRecordRow } from './pointsApi';
import './points.css';

const reasonTypeLabel: Record<PointReason['type'], string> = {
  PLUS: '상점',
  MINUS: '벌점',
  ETC: '기타',
};

type RecordSort = 'baseDate' | 'createdAt' | 'studentNo' | 'studentName' | 'point' | 'teacherName';

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(value))
    .replace(/\. /g, '. ')
    .replace(/\.$/, '');
}

export function PointRecordsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<PointReason['type'] | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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

  const columns = useMemo<ColumnDef<PointRecordRow>[]>(
    () => [
      {
        accessorKey: 'baseDate',
        header: '기준일',
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
        meta: { align: 'center', width: 110 },
      },
      {
        accessorKey: 'studentName',
        header: '이름',
        meta: { align: 'center', width: 120 },
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
        meta: { minWidth: 260, truncate: true },
      },
      {
        accessorKey: 'point',
        header: '점수',
        cell: ({ row }) => (
          <strong className={row.original.point < 0 ? 'point-value--danger' : ''}>
            {row.original.point > 0 ? '+' : ''}
            {row.original.point}
          </strong>
        ),
        meta: { align: 'center', width: 90 },
      },
      {
        accessorKey: 'teacherName',
        header: '처리자',
        meta: { align: 'center', width: 140 },
      },
    ],
    [],
  );

  const resetPage = () => setPage(1);

  return (
    <AdminListPanel
      className="point-panel"
      toolbar={
        <TableToolbar summary={recordsQuery.data ? `총 ${recordsQuery.data.total}건` : undefined}>
          <label className="point-filter point-filter--search">
            <span>검색</span>
            <input
              value={search}
              placeholder="학번, 이름, 사유 또는 처리자"
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
          <PageSizeSelect
            value={pageSize}
            onChange={(value) => {
              setPageSize(value);
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
          onPageChange: (nextPage) => setPage(nextPage + 1),
        }}
        alwaysShowPagination
        getRowId={(row) => String(row.id)}
      />
    </AdminListPanel>
  );
}

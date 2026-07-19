import { useState } from 'react';
import type {
  ActivityRequestAdminListQuery,
  ActivityRequestAdminStatus,
  ActivityRequestAdminSummary,
} from '@jshsus/types';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { DataTable } from '../../components/DataTable';
import { AdminListPanel, PageSizeSelect, TableToolbar } from '../../components/ui';
import {
  ActivityStatusBadge,
  activityStatusOptions,
  formatActivityDateTime,
  useActivityRequests,
} from './activityRequests';
import { koreaDateInput } from './activitySchedule';
import './operations.css';

const columns: ColumnDef<ActivityRequestAdminSummary>[] = [
  {
    accessorKey: 'issuedNumber',
    header: '번호',
    cell: ({ row }) => `#${row.original.id}`,
    meta: { widthPreset: 'index' },
  },
  {
    id: 'representative',
    accessorFn: (request) => `${request.studentNo} ${request.studentName}`,
    header: '대표 학생',
    cell: ({ row }) => (
      <strong className="operation-student-name">
        {row.original.studentNo} {row.original.studentName}
      </strong>
    ),
    meta: { minWidth: 145 },
  },
  {
    id: 'participantCount',
    accessorFn: (request) => request.participants.length,
    header: '참여 인원',
    enableSorting: false,
    cell: ({ getValue }) => `${getValue<number>()}명`,
    meta: { width: 92, align: 'center' },
  },
  {
    accessorKey: 'purpose',
    header: '활동 목적',
    enableSorting: false,
    meta: { minWidth: 220, maxWidth: 420, truncate: true },
  },
  {
    accessorKey: 'location',
    header: '장소',
    enableSorting: false,
    meta: { minWidth: 120, maxWidth: 190, truncate: true },
  },
  {
    accessorKey: 'startsAt',
    header: '활동 일시',
    cell: ({ getValue }) => formatActivityDateTime(getValue<string>()),
    meta: { width: 175, align: 'center' },
  },
  {
    accessorKey: 'advisorTeacherName',
    header: '담당 교사',
    enableSorting: false,
    cell: ({ getValue }) => getValue<string | undefined>() ?? '-',
    meta: { width: 110, align: 'center' },
  },
  {
    accessorKey: 'status',
    header: '상태',
    enableSorting: false,
    cell: ({ getValue }) => <ActivityStatusBadge status={getValue<ActivityRequestAdminStatus>()} />,
    meta: { width: 88, align: 'center' },
  },
];

export function ActivityOverviewPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(() => koreaDateInput());
  const [status, setStatus] = useState<'all' | ActivityRequestAdminStatus>('all');
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'issuedNumber', desc: true }]);
  const sort = sorting[0];
  const requestsQuery = useActivityRequests({
    page,
    pageSize: pageSize as 20 | 50 | 100,
    search: search || undefined,
    date: date || undefined,
    status: status === 'all' ? undefined : status,
    sortBy: (sort?.id as ActivityRequestAdminListQuery['sortBy']) ?? 'issuedNumber',
    sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : 'desc',
  });
  const resetPage = () => setPage(1);

  return (
    <div className="admin-stack operation-page">
      <AdminListPanel
        title="탐구활동서 현황"
        toolbar={
          <TableToolbar
            summary={requestsQuery.data ? `총 ${requestsQuery.data.total}건` : undefined}
            className="operation-list-toolbar"
          >
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="학생, 담당 교사, 장소, 활동 목적 검색"
              aria-label="탐구활동서 검색"
            />
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                resetPage();
              }}
              aria-label="활동 날짜 필터"
            />
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                resetPage();
              }}
              aria-label="상태 필터"
            >
              <option value="all">전체</option>
              {activityStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
        {requestsQuery.isError ? (
          <p className="form-error">탐구활동서 현황을 불러오지 못했습니다.</p>
        ) : (
          <DataTable
            columns={columns}
            data={requestsQuery.data?.items ?? []}
            sorting={sorting}
            onSortingChange={(updater) => {
              setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
              resetPage();
            }}
            manualSorting
            pagination={{
              pageIndex: page - 1,
              pageSize,
              pageCount: requestsQuery.data?.totalPages ?? 1,
              totalCount: requestsQuery.data?.total,
              onPageChange: (nextPage) => setPage(nextPage + 1),
            }}
            loading={requestsQuery.isPending}
            loadingText="탐구활동서 현황을 불러오는 중입니다."
            emptyText="조건에 맞는 탐구활동서가 없습니다."
            alwaysShowPagination
            caption="탐구활동서 현황"
            getRowId={(request) => String(request.id)}
          />
        )}
      </AdminListPanel>
    </div>
  );
}

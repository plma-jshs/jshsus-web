import { useState } from 'react';
import type {
  ActivityRequestAdminListQuery,
  ActivityRequestAdminStatus,
  ActivityRequestAdminSummary,
} from '@jshsus/types';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { AdminListPanel, PageSizeSelect, TableToolbar } from '../../components/ui';
import {
  ActivityStatusBadge,
  activityStatusOptions,
  useActivityRequests,
} from './activityRequests';
import {
  formatActivityPeriodLabel,
  formatActivityTimeRanges,
  koreaDateInput,
} from './activitySchedule';
import './operations.css';

const activityDayFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
});

function formatParticipants(request: ActivityRequestAdminSummary) {
  const participants = request.participants.length
    ? request.participants
    : [
        {
          studentNo: request.studentNo,
          studentName: request.studentName,
          isRepresentative: true,
        },
      ];
  return participants
    .map(
      (student) =>
        `${student.studentNo}${student.studentName}${student.isRepresentative ? '(대표)' : ''}`,
    )
    .join(', ');
}

const columns: ColumnDef<ActivityRequestAdminSummary>[] = [
  {
    accessorKey: 'id',
    header: '번호',
    cell: ({ row }) => `#${row.original.id}`,
    meta: { widthPreset: 'index' },
  },
  {
    id: 'date',
    accessorFn: (request) => request.startsAt,
    header: '날짜',
    enableSorting: false,
    cell: ({ row }) => activityDayFormatter.format(new Date(row.original.startsAt)),
    meta: { width: 76, align: 'center' },
  },
  {
    id: 'time',
    accessorFn: (request) => request.startsAt,
    header: '시간',
    enableSorting: false,
    cell: ({ row }) => {
      const request = row.original;
      const date = koreaDateInput(new Date(request.startsAt));
      return (
        <span className="operation-activity-time">
          <strong>
            {formatActivityPeriodLabel(
              date,
              request.startsAt,
              request.endsAt,
              request.activitySlotIds,
            )}
          </strong>
          <span>
            {formatActivityTimeRanges(
              date,
              request.startsAt,
              request.endsAt,
              request.activitySlotIds,
            )}
          </span>
        </span>
      );
    },
    meta: { minWidth: 164, align: 'center' },
  },
  {
    accessorKey: 'location',
    header: '장소',
    enableSorting: false,
    meta: { minWidth: 160, maxWidth: 250, truncate: true },
  },
  {
    accessorKey: 'purpose',
    header: '내용',
    enableSorting: false,
    meta: { minWidth: 220, maxWidth: 380, truncate: true },
  },
  {
    id: 'participants',
    accessorFn: formatParticipants,
    header: '인원',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="operation-activity-participants">{formatParticipants(row.original)}</span>
    ),
    meta: { minWidth: 180, maxWidth: 260 },
  },
  {
    accessorKey: 'advisorTeacherName',
    header: '지도교사',
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'all' | ActivityRequestAdminStatus>('all');
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'id', desc: true }]);
  const sort = sorting[0];
  const requestsQuery = useActivityRequests({
    page,
    pageSize: pageSize as 20 | 50 | 100,
    search: search || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    status: status === 'all' ? undefined : status,
    sortBy: (sort?.id as ActivityRequestAdminListQuery['sortBy']) ?? 'id',
    sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : 'desc',
  });
  const resetPage = () => setPage(1);

  return (
    <div className="admin-stack operation-page">
      <AdminListPanel
        toolbar={
          <TableToolbar
            summary={requestsQuery.data ? `총 ${requestsQuery.data.total}건` : undefined}
            className="operation-list-toolbar"
          >
            <label className="operation-search-field">
              <span className="sr-only">탐구활동서 검색</span>
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                placeholder="내용, 인원, 장소, 지도교사 검색"
              />
            </label>
            <label className="operation-date-filter">
              <span>시작일</span>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  resetPage();
                }}
              />
            </label>
            <span className="operation-date-separator" aria-hidden="true">
              ~
            </span>
            <label className="operation-date-filter">
              <span>마감일</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  resetPage();
                }}
              />
            </label>
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

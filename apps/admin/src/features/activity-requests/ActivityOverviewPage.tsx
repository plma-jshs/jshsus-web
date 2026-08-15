import { useState } from 'react';
import type {
  ActivityPrintFloor,
  ActivityRequestAdminListQuery,
  ActivityRequestAdminStatus,
  ActivityRequestAdminSummary,
  ActivityRequestPrintBatch,
} from '@jshsus/types';
import { useMutation } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { ChevronRight, Printer, Search, Users } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  AdminListPanel,
  AdminSelect,
  DateRangeField,
  Drawer,
  MobileSortSelect,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import { formatKoreanDate } from '../../shared/lib/date';
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
import { ActivityParticipants } from './ActivityParticipants';
import { ActivityPrintPreviewModal } from './ActivityPrintPreviewModal';
import './operations.css';

function formatParticipants(request: ActivityRequestAdminSummary) {
  const participants = request.participants.length
    ? request.participants
    : [
        {
          studentId: request.studentNo,
          studentNo: request.studentNo,
          studentName: request.studentName,
          isRepresentative: true,
        },
      ];
  return participants
    .map(
      (student) =>
        `${student.studentNo} ${student.studentName}${student.isRepresentative ? '(대표)' : ''}`,
    )
    .join(', ');
}

function activityParticipants(request: ActivityRequestAdminSummary) {
  return request.participants.length
    ? request.participants
    : [
        {
          studentId: request.studentNo,
          studentNo: request.studentNo,
          studentName: request.studentName,
          isRepresentative: true,
        },
      ];
}

function formatActivityMobileDate(request: ActivityRequestAdminSummary) {
  const date = formatKoreanDate(request.startsAt, {
    month: '2-digit',
    day: '2-digit',
  });
  const weekday = formatKoreanDate(request.startsAt, { weekday: 'short' });
  return `${date}(${weekday})`;
}

function ActivityPrintMenu({ disabled, onOpen }: { disabled?: boolean; onOpen: () => void }) {
  return (
    <button
      className="quiet-button activity-print-trigger"
      type="button"
      disabled={disabled}
      onClick={onOpen}
    >
      <Printer size={15} aria-hidden="true" />
      인쇄
    </button>
  );
}

function ActivityMobileCard({
  request,
  onOpen,
}: {
  request: ActivityRequestAdminSummary;
  onOpen: () => void;
}) {
  const participants = activityParticipants(request);
  const date = koreaDateInput(new Date(request.startsAt));

  return (
    <div
      className="operation-activity-mobile-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen();
      }}
    >
      <span className="operation-activity-mobile-card__heading">
        <ActivityStatusBadge status={request.status} />
        <strong>{request.purpose}</strong>
        <ChevronRight size={17} aria-hidden="true" />
      </span>
      <span className="operation-activity-mobile-card__meta">
        <span>{request.location}</span>
        <i aria-hidden="true">·</i>
        <span>지도교사 {request.advisorTeacherName ?? '-'}</span>
      </span>
      <span className="operation-activity-mobile-card__meta">
        <span>{formatActivityMobileDate(request)}</span>
        <i aria-hidden="true">·</i>
        <span>
          {formatActivityPeriodLabel(
            date,
            request.startsAt,
            request.endsAt,
            request.activitySlotIds,
          )}
        </span>
        <span className="operation-activity-mobile-card__time">
          {formatActivityTimeRanges(
            date,
            request.startsAt,
            request.endsAt,
            request.activitySlotIds,
          )}
        </span>
      </span>
      <span className="operation-activity-mobile-card__people">
        <Users size={14} aria-hidden="true" />
        <ActivityParticipants
          participants={participants}
          fallback={request}
          className="operation-activity-participants"
        />
      </span>
    </div>
  );
}

const columns: ColumnDef<ActivityRequestAdminSummary>[] = [
  {
    accessorKey: 'id',
    header: '번호',
    cell: ({ row }) => `#${row.original.id}`,
    meta: { widthPreset: 'index', hideOnMobile: true },
  },
  {
    id: 'startsAt',
    accessorFn: (request) => request.startsAt,
    header: '날짜',
    enableSorting: true,
    cell: ({ row }) =>
      formatKoreanDate(row.original.startsAt, { month: '2-digit', day: '2-digit' }),
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
    meta: { minWidth: 220, maxWidth: 380, truncate: true, mobileRole: 'title' },
  },
  {
    id: 'participants',
    accessorFn: formatParticipants,
    header: '인원',
    enableSorting: false,
    cell: ({ row }) => (
      <ActivityParticipants
        participants={row.original.participants}
        fallback={row.original}
        className="operation-activity-participants"
      />
    ),
    meta: { minWidth: 180, maxWidth: 260 },
  },
  {
    accessorKey: 'advisorTeacherName',
    header: '지도교사',
    enableSorting: false,
    cell: ({ getValue }) => getValue<string | undefined>() ?? '-',
    meta: { width: 110, align: 'left' },
  },
  {
    accessorKey: 'status',
    header: '상태',
    enableSorting: false,
    cell: ({ getValue }) => <ActivityStatusBadge status={getValue<ActivityRequestAdminStatus>()} />,
    meta: { width: 88, align: 'center', mobileRole: 'badge' },
  },
];

export function ActivityOverviewPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(() => koreaDateInput());
  const [status, setStatus] = useState<'all' | ActivityRequestAdminStatus>('all');
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'startsAt', desc: true }]);
  const [selectedRequest, setSelectedRequest] = useState<ActivityRequestAdminSummary | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printFloor, setPrintFloor] = useState<ActivityPrintFloor>('all');
  const [printBatch, setPrintBatch] = useState<ActivityRequestPrintBatch | null>(null);
  const [printMessage, setPrintMessage] = useState('');
  const sort = sorting[0];
  const requestsQuery = useActivityRequests({
    page,
    pageSize: pageSize as 20 | 50 | 100,
    search: search || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    status: status === 'all' ? undefined : status,
    sortBy: (sort?.id as ActivityRequestAdminListQuery['sortBy']) ?? 'startsAt',
    sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : 'desc',
  });
  const printMutation = useMutation({
    mutationFn: (floor: ActivityPrintFloor) => api.printTodayActivityRequests({ floor }),
    onSuccess: (result) => {
      setPrintBatch(result);
      setPrintMessage('');
      if (!result.documents.length) return;
      showToast({
        title: `${result.floor === 'all' ? '전체' : `${result.floor}층`} ${result.documents.length}건의 인쇄 화면을 준비했습니다.`,
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '인쇄 자료를 준비하지 못했습니다.', tone: 'danger' }),
  });
  const openPrintDialog = () => {
    setPrintDialogOpen(true);
    setPrintFloor('all');
    setPrintBatch(null);
    setPrintMessage('');
    printMutation.mutate('all');
  };
  const changePrintFloor = (floor: ActivityPrintFloor) => {
    setPrintFloor(floor);
    setPrintBatch(null);
    setPrintMessage('');
    printMutation.mutate(floor);
  };
  const resetPage = () => setPage(1);

  return (
    <div className="admin-stack operation-page">
      <AdminListPanel
        toolbar={
          <TableToolbar
            summary={requestsQuery.data ? `총 ${requestsQuery.data.total}건` : undefined}
            className="operation-list-toolbar"
            mobileSearch={
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
            }
            mobileSort={
              <MobileSortSelect
                value={`${sort?.id ?? 'startsAt'}:${sort?.desc ? 'desc' : 'asc'}`}
                options={[
                  { value: 'startsAt:desc', label: '활동일 최신순' },
                  { value: 'startsAt:asc', label: '활동일 오래된순' },
                ]}
                onChange={(value) => {
                  const [id, direction] = value.split(':');
                  setSorting([{ id: id ?? 'startsAt', desc: direction === 'desc' }]);
                  resetPage();
                }}
              />
            }
          >
            <DateRangeField
              label="활동일"
              from={startDate}
              to={endDate}
              onFromChange={(value) => {
                setStartDate(value);
                resetPage();
              }}
              onToChange={(value) => {
                setEndDate(value);
                resetPage();
              }}
            />
            <AdminSelect
              mobileLabel="상태"
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
            </AdminSelect>
            <ActivityPrintMenu disabled={printMutation.isPending} onOpen={openPrintDialog} />
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
              onPageSizeChange: (nextPageSize) => {
                setPageSize(nextPageSize);
                resetPage();
              },
            }}
            loading={requestsQuery.isPending}
            loadingText="탐구활동서 현황을 불러오는 중입니다."
            emptyText="조건에 맞는 탐구활동서가 없습니다."
            alwaysShowPagination
            caption="탐구활동서 현황"
            getRowId={(request) => String(request.id)}
            renderMobileRow={(request) => (
              <ActivityMobileCard request={request} onOpen={() => setSelectedRequest(request)} />
            )}
          />
        )}
      </AdminListPanel>
      {printMessage ? <p className="operation-inline-message">{printMessage}</p> : null}
      <Drawer
        open={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
        title={selectedRequest?.purpose ?? '탐구활동서 상세'}
        description={selectedRequest ? formatParticipants(selectedRequest) : undefined}
      >
        {selectedRequest ? (
          <dl className="operation-activity-mobile-detail">
            <div>
              <dt>상태</dt>
              <dd>
                <ActivityStatusBadge status={selectedRequest.status} />
              </dd>
            </div>
            <div>
              <dt>활동 정보</dt>
              <dd>
                {formatActivityMobileDate(selectedRequest)} · {selectedRequest.location} · 지도교사{' '}
                {selectedRequest.advisorTeacherName ?? '-'}
              </dd>
            </div>
            <div>
              <dt>참여 학생</dt>
              <dd>{formatParticipants(selectedRequest)}</dd>
            </div>
            {selectedRequest.rejectionReason ? (
              <div>
                <dt>반려 사유</dt>
                <dd>{selectedRequest.rejectionReason}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Drawer>
      {printDialogOpen ? (
        <ActivityPrintPreviewModal
          batch={printBatch}
          floor={printFloor}
          isLoading={printMutation.isPending}
          errorMessage={printMessage}
          onFloorChange={changePrintFloor}
          onClose={() => {
            setPrintDialogOpen(false);
            setPrintBatch(null);
            setPrintMessage('');
          }}
        />
      ) : null}
    </div>
  );
}

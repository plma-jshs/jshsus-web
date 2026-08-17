import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Check, ExternalLink, X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  DialogActions,
  Drawer,
  AdminSearchField,
  RowActionButton,
  RowActions,
  SegmentedTabs,
  TableSummary,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { YouTubeSegmentPlayer } from '../../components/youtube/YouTubeSegmentPlayer';
import { wakeSongAdminApi } from './api';
import { formatAdminDate } from '../../shared/lib/date';
import type { WakeSongRequest, WakeSongRequestStatus } from './types';
import './wake-songs.css';

type WakeSongReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const statusLabels: Record<WakeSongRequestStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  SCHEDULED: '승인',
  PLAYED: '승인',
  CANCELED: '반려',
};

const statusOptions: Array<{ value: WakeSongReviewStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'PENDING', label: '대기' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '반려' },
];

function statusTone(status: WakeSongRequestStatus) {
  if (status === 'PENDING') return 'pending';
  if (status === 'APPROVED' || status === 'SCHEDULED' || status === 'PLAYED') return 'approved';
  return 'rejected';
}

function formatDuration(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function WakeSongsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [status, setStatus] = useState<WakeSongReviewStatus | 'ALL'>('PENDING');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const requestsQuery = useQuery({
    queryKey: ['admin', 'wake-songs', status, appliedQuery, page, pageSize, sorting],
    queryFn: () =>
      wakeSongAdminApi.list({
        status: status === 'ALL' ? undefined : status,
        query: appliedQuery || undefined,
        page,
        pageSize,
        sortBy:
          (sorting[0]?.id as 'status' | 'requester' | 'videoTitle' | 'createdAt' | undefined) ??
          'createdAt',
        sortOrder: sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : 'desc',
      }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'wake-songs'] });
  };
  const approveMutation = useMutation({
    mutationFn: wakeSongAdminApi.approve,
    onSuccess: async () => {
      await refresh();
      showToast({ title: '기상곡 신청을 승인했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '기상곡 신청을 승인하지 못했습니다.', tone: 'danger' }),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      wakeSongAdminApi.reject(id, reason),
    onSuccess: async () => {
      setRejectingId(null);
      setRejectionReason('');
      await refresh();
      showToast({ title: '기상곡 신청을 반려했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '기상곡 신청을 반려하지 못했습니다.', tone: 'danger' }),
  });

  const columns: ColumnDef<WakeSongRequest>[] = [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: '신청일',
      cell: ({ row }) =>
        formatAdminDate(row.original.createdAt, {
          month: '2-digit',
          day: '2-digit',
        }),
      meta: { kind: 'dateTime', width: 130 },
    },
    {
      id: 'requester',
      accessorKey: 'requesterName',
      header: '신청자',
      cell: ({ row }) => (
        <div className="wake-song-admin-cell">
          <strong>{row.original.requesterName}</strong>
          <small>{row.original.requesterStudentNo}</small>
        </div>
      ),
      meta: { kind: 'person', width: 150, mobileRole: 'subtitle' },
    },
    {
      id: 'candidateWeek',
      header: '대상 주차',
      cell: ({ row }) => row.original.candidateWeekLabel ?? '',
      enableSorting: false,
      meta: { align: 'center', width: 190 },
    },
    {
      id: 'videoTitle',
      accessorKey: 'videoTitle',
      header: '영상',
      cell: ({ row }) => (
        <div className="wake-song-admin-title">
          <button type="button" onClick={() => setSelectedId(row.original.id)}>
            {row.original.videoTitle}
          </button>
          <small>{row.original.channelTitle ?? 'YouTube'}</small>
        </div>
      ),
      enableSorting: false,
      meta: { minWidth: 260, maxWidth: 420, mobileRole: 'title' },
    },
    {
      id: 'segment',
      header: '재생 구간',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="wake-song-admin-cell">
          <strong>
            {formatDuration(row.original.startSeconds)}–{formatDuration(row.original.endSeconds)}
          </strong>
          <small>
            {row.original.playbackRate}배 · 실제{' '}
            {formatDuration(row.original.effectiveDurationSeconds)}
          </small>
        </div>
      ),
      meta: { align: 'center', width: 180 },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => (
        <span className={`wake-admin-status is-${statusTone(row.original.status)}`}>
          {statusLabels[row.original.status]}
        </span>
      ),
      enableSorting: false,
      meta: { kind: 'category', width: 110, mobileRole: 'badge' },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => {
        const request = row.original;
        if (request.status !== 'PENDING') return '';
        return (
          <RowActions>
            <RowActionButton
              icon={<Check size={14} aria-hidden="true" />}
              label="기상곡 승인"
              variant="primary"
              onClick={() => approveMutation.mutate(request.id)}
              disabled={approveMutation.isPending}
            />
            <RowActionButton
              icon={<X size={14} aria-hidden="true" />}
              label="기상곡 반려"
              variant="danger"
              onClick={() => {
                setRejectingId(request.id);
                setRejectionReason('');
              }}
            />
          </RowActions>
        );
      },
      meta: { align: 'center', width: 92, mobileRole: 'actions' },
    },
  ];

  const pageData = requestsQuery.data;
  const selectedRequest = pageData?.items.find((request) => request.id === selectedId);

  return (
    <div className="admin-stack wake-song-admin">
      <section className="admin-panel wake-song-admin-list">
        <TableToolbar
          className="wake-song-admin-toolbar"
          summary={
            <TableSummary count={pageData?.total} suffix="건" loading={requestsQuery.isPending} />
          }
          mobileSheetTitle="기상곡 필터"
          mobileSearch={
            <div className="wake-song-admin-search">
              <AdminSearchField
                className="wake-song-admin-search-field"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="영상, 신청자, 메모 검색"
                aria-label="신청 검색"
                onClear={() => setQuery('')}
              />
            </div>
          }
        >
          <SegmentedTabs
            value={status}
            options={statusOptions}
            ariaLabel="기상곡 신청 상태"
            onChange={(nextStatus) => {
              setStatus(nextStatus);
              setPage(1);
            }}
          />
        </TableToolbar>
        {requestsQuery.isError ? (
          <div className="admin-panel error compact-empty">
            목록을 불러오지 못했습니다. API 연결과 권한을 확인해 주세요.
          </div>
        ) : null}
        <DataTable
          columns={columns}
          data={pageData?.items ?? []}
          loading={requestsQuery.isLoading}
          emptyText="조건에 맞는 기상곡 신청이 없습니다."
          alwaysShowPagination
          manualSorting
          sorting={sorting}
          onSortingChange={(updater) => {
            setPage(1);
            setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
          }}
          pagination={{
            pageIndex: page - 1,
            pageSize,
            pageCount: pageData?.totalPages ?? 1,
            totalCount: pageData?.total ?? 0,
            onPageChange: (pageIndex) => setPage(pageIndex + 1),
            onPageSizeChange: (nextPageSize) => {
              setPage(1);
              setPageSize(nextPageSize);
            },
          }}
          getRowId={(request) => String(request.id)}
          caption="기상곡 신청 목록"
        />
      </section>

      {selectedRequest ? (
        <Drawer
          open
          onClose={() => setSelectedId(null)}
          title={selectedRequest.videoTitle}
          description={`신청 #${selectedRequest.id}`}
          className="wake-song-admin-drawer"
        >
          <div className="wake-song-admin-detail">
            <YouTubeSegmentPlayer
              className="wake-song-admin-player"
              videoId={selectedRequest.youtubeVideoId}
              startSeconds={selectedRequest.startSeconds}
              endSeconds={selectedRequest.endSeconds}
              playbackRate={selectedRequest.playbackRate}
              title={`${selectedRequest.videoTitle} 미리보기`}
            />
            <div className="wake-song-admin-detail-copy">
              <dl>
                <div>
                  <dt>신청자</dt>
                  <dd>
                    {selectedRequest.requesterStudentNo} {selectedRequest.requesterName}
                  </dd>
                </div>
                <div>
                  <dt>대상 주차</dt>
                  <dd>{selectedRequest.candidateWeekLabel ?? ''}</dd>
                </div>
                <div>
                  <dt>재생</dt>
                  <dd>
                    {formatDuration(selectedRequest.startSeconds)}–
                    {formatDuration(selectedRequest.endSeconds)} · {selectedRequest.playbackRate}배
                  </dd>
                </div>
                <div>
                  <dt>메모</dt>
                  <dd>{selectedRequest.requestNote || '없음'}</dd>
                </div>
                {selectedRequest.rejectionReason ? (
                  <div>
                    <dt>반려 사유</dt>
                    <dd>{selectedRequest.rejectionReason}</dd>
                  </div>
                ) : null}
              </dl>
              <a href={selectedRequest.canonicalUrl} target="_blank" rel="noreferrer">
                YouTube에서 보기 <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </Drawer>
      ) : null}

      {rejectingId ? (
        <section className="admin-panel wake-song-admin-action-panel">
          <div className="panel-title-copy">
            <X size={20} aria-hidden="true" />
            <div>
              <h2>신청 반려</h2>
              <p>학생에게 표시할 반려 사유를 입력해 주세요.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              rejectMutation.mutate({ id: rejectingId, reason: rejectionReason });
            }}
          >
            <label>
              <span>반려 사유</span>
              <input
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                maxLength={500}
                required
              />
            </label>
            <DialogActions
              confirmLabel="반려 확정"
              pendingLabel="처리 중"
              confirmDisabled={rejectMutation.isPending}
              onClose={() => setRejectingId(null)}
            />
          </form>
        </section>
      ) : null}
    </div>
  );
}

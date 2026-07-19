import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Check, ExternalLink, Music2, Search, X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { Drawer, PageSizeSelect, SegmentedTabs, TableToolbar, useToast } from '../../components/ui';
import { YouTubeSegmentPlayer } from '../../components/youtube/YouTubeSegmentPlayer';
import { wakeSongAdminApi } from './api';
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
        new Date(row.original.createdAt).toLocaleDateString('ko-KR').replace(/\.$/, ''),
      meta: { align: 'center', width: 130 },
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
      meta: { align: 'center', width: 150 },
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
      meta: { minWidth: 260, maxWidth: 420 },
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
      meta: { align: 'center', width: 110 },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => {
        const request = row.original;
        return (
          <div className="table-action-row">
            {request.status === 'PENDING' ? (
              <>
                <button
                  className="table-action is-positive"
                  type="button"
                  onClick={() => approveMutation.mutate(request.id)}
                  disabled={approveMutation.isPending}
                >
                  <Check size={14} aria-hidden="true" /> 승인
                </button>
                <button
                  className="table-action danger"
                  type="button"
                  onClick={() => {
                    setRejectingId(request.id);
                    setRejectionReason('');
                  }}
                >
                  <X size={14} aria-hidden="true" /> 반려
                </button>
              </>
            ) : null}
            {request.status !== 'PENDING' ? '—' : null}
          </div>
        );
      },
      meta: { align: 'center', minWidth: 180 },
    },
  ];

  const pageData = requestsQuery.data;
  const selectedRequest = pageData?.items.find((request) => request.id === selectedId);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedQuery(query.trim());
    setPage(1);
  };

  return (
    <div className="admin-stack wake-song-admin">
      <section className="admin-panel wake-song-admin-toolbar">
        <SegmentedTabs
          value={status}
          options={statusOptions}
          ariaLabel="기상곡 신청 상태"
          onChange={(nextStatus) => {
            setStatus(nextStatus);
            setPage(1);
          }}
        />
        <form className="wake-song-admin-search" onSubmit={submitSearch}>
          <label>
            <span className="sr-only">신청 검색</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="영상, 신청자, 메모 검색"
            />
          </label>
          <button className="quiet-button" type="submit">
            <Search size={15} aria-hidden="true" /> 검색
          </button>
        </form>
        <PageSizeSelect
          value={pageSize}
          onChange={(nextPageSize) => {
            setPage(1);
            setPageSize(nextPageSize);
          }}
        />
      </section>

      <section className="admin-panel wake-song-admin-list">
        <div className="panel-title">
          <div className="panel-title-copy">
            <Music2 size={20} aria-hidden="true" />
            <div>
              <h2>기상곡 신청</h2>
            </div>
          </div>
        </div>

        {requestsQuery.isError ? (
          <div className="admin-panel error compact-empty">
            목록을 불러오지 못했습니다. API 연결과 권한을 확인해 주세요.
          </div>
        ) : null}
        <TableToolbar summary={`총 ${pageData?.total ?? 0}건`} />
        <DataTable
          columns={columns}
          data={pageData?.items ?? []}
          loading={requestsQuery.isLoading}
          loadingText="기상곡 신청을 불러오는 중입니다."
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
            <div className="button-row">
              <button className="primary-button" type="submit" disabled={rejectMutation.isPending}>
                반려 확정
              </button>
              <button className="quiet-button" type="button" onClick={() => setRejectingId(null)}>
                취소
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

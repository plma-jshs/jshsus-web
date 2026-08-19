import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Check, Download, ExternalLink, Pencil, X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  DialogActions,
  Drawer,
  AdminSearchField,
  RowActionButton,
  RowActions,
  TableSelectionCheckbox,
  SegmentedTabs,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { YouTubeSegmentPlayer } from '../../components/youtube/YouTubeSegmentPlayer';
import { wakeSongAdminApi } from './api';
import { formatAdminDate } from '../../shared/lib/date';
import type { WakeSongRequest, WakeSongRequestStatus } from './types';
import { getAdminWakeSongWeek } from './week';
import './wake-songs.css';

type WakeSongReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type WakeSongEditState = {
  url: string;
  startSeconds: string;
  endSeconds: string;
  playbackRate: string;
  requestNote: string;
};

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

function downloadWakeSongMetadata(request: WakeSongRequest) {
  // Requests only persist a YouTube segment; no audio binary is stored on the
  // server. Download a portable edit manifest instead of pretending that a
  // remote stream is an MP3 file.
  const payload = [
    `제목: ${request.videoTitle}`,
    `URL: ${request.canonicalUrl}`,
    `구간: ${formatDuration(request.startSeconds)}-${formatDuration(request.endSeconds)}`,
    `재생 속도: ${request.playbackRate}배`,
  ].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([payload], { type: 'text/plain;charset=utf-8' }));
  link.download = `${request.videoTitle.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function editStateFromRequest(request: WakeSongRequest): WakeSongEditState {
  return {
    url: request.canonicalUrl,
    startSeconds: String(request.startSeconds),
    endSeconds: String(request.endSeconds),
    playbackRate: String(request.playbackRate),
    requestNote: request.requestNote,
  };
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<WakeSongEditState | null>(null);
  const [editError, setEditError] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [playerVolume, setPlayerVolume] = useState(100);
  const [weekOffset, setWeekOffset] = useState(0);
  const selectedWeek = getAdminWakeSongWeek(new Date(), weekOffset);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const requestsQuery = useQuery({
    queryKey: [
      'admin',
      'wake-songs',
      status,
      appliedQuery,
      page,
      pageSize,
      sorting,
      selectedWeek.startDate,
    ],
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
        weekStart: selectedWeek.startDate,
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
  const editMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: WakeSongEditState }) =>
      wakeSongAdminApi.update(id, {
        url: input.url,
        startSeconds: Number(input.startSeconds),
        endSeconds: Number(input.endSeconds),
        playbackRate: Number(input.playbackRate),
        requestNote: input.requestNote,
      }),
    onSuccess: async () => {
      setEditingId(null);
      setEditState(null);
      setEditError('');
      await refresh();
      showToast({ title: '기상곡 신청을 수정했습니다.', tone: 'success' });
    },
    onError: (error) => {
      setEditError(error instanceof Error ? error.message : '수정하지 못했습니다.');
    },
  });
  const beginEdit = (request: WakeSongRequest) => {
    setSelectedId(request.id);
    setEditingId(request.id);
    setEditState(editStateFromRequest(request));
    setEditError('');
  };
  const downloadSelectedRequests = () => {
    requestsQuery.data?.items
      .filter((request) => selectedIds.has(request.id))
      .forEach(downloadWakeSongMetadata);
  };

  const columns: ColumnDef<WakeSongRequest>[] = [
    {
      id: 'selection',
      header: () => (
        <TableSelectionCheckbox
          checked={
            Boolean(pageData?.items.length) &&
            pageData!.items.every((item) => selectedIds.has(item.id))
          }
          label="기상곡 신청 전체 선택"
          onChange={(checked) =>
            setSelectedIds((current) => {
              const next = new Set(current);
              pageData?.items.forEach((item) =>
                checked ? next.add(item.id) : next.delete(item.id),
              );
              return next;
            })
          }
        />
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <TableSelectionCheckbox
          checked={selectedIds.has(row.original.id)}
          label={`${row.original.requesterName} 신청 선택`}
          onChange={(checked) =>
            setSelectedIds((current) => {
              const next = new Set(current);
              if (checked) next.add(row.original.id);
              else next.delete(row.original.id);
              return next;
            })
          }
        />
      ),
      meta: { align: 'center', widthPreset: 'selection', hideOnMobile: true },
    },
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
      header: () =>
        selectedIds.size ? (
          <button
            className="wake-song-selected-download"
            type="button"
            onClick={downloadSelectedRequests}
          >
            <Download size={14} aria-hidden="true" /> 선택 다운로드 ({selectedIds.size})
          </button>
        ) : (
          '신청자'
        ),
      cell: ({ row }) => (
        <div className="wake-song-admin-cell">
          <strong>{row.original.requesterName}</strong>
          <small>{row.original.requesterStudentNo}</small>
        </div>
      ),
      meta: { kind: 'person', width: 150, mobileRole: 'subtitle' },
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
        if (request.status !== 'PENDING') {
          return (
            <RowActions mobileTitle={`${request.requesterName} 기상곡`}>
              <RowActionButton
                icon={<Download size={14} aria-hidden="true" />}
                label="기상곡 편집 정보 다운로드"
                mobileLabel="편집 정보"
                variant="secondary"
                onClick={() => downloadWakeSongMetadata(request)}
              />
              {request.status !== 'PLAYED' && request.status !== 'CANCELED' ? (
                <RowActionButton
                  icon={<Pencil size={14} aria-hidden="true" />}
                  label="기상곡 수정"
                  mobileLabel="수정"
                  variant="secondary"
                  onClick={() => beginEdit(request)}
                />
              ) : null}
            </RowActions>
          );
        }
        return (
          <RowActions mobileTitle={`${request.requesterName} 기상곡`}>
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
            <RowActionButton
              icon={<Pencil size={14} aria-hidden="true" />}
              label="기상곡 수정"
              mobileLabel="수정"
              variant="secondary"
              onClick={() => beginEdit(request)}
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
          mobileResetDisabled={
            status === 'PENDING' &&
            !query &&
            !appliedQuery &&
            sorting[0]?.id === 'createdAt' &&
            sorting[0]?.desc === true
          }
          mobileReset={() => {
            setStatus('PENDING');
            setQuery('');
            setAppliedQuery('');
            setPage(1);
            setSorting([{ id: 'createdAt', desc: true }]);
          }}
          className="wake-song-admin-toolbar"
          summary={
            <div className="wake-song-week-navigator" aria-label="대상 주차">
              <button
                type="button"
                aria-label="이전 주차"
                onClick={() => {
                  setWeekOffset((current) => current - 1);
                  setPage(1);
                }}
              >
                ‹
              </button>
              <strong>{selectedWeek.label}</strong>
              <button
                type="button"
                aria-label="다음 주차"
                onClick={() => {
                  setWeekOffset((current) => current + 1);
                  setPage(1);
                }}
              >
                ›
              </button>
            </div>
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
          onClose={() => {
            setSelectedId(null);
            setEditingId(null);
            setEditState(null);
            setEditError('');
          }}
          title={selectedRequest.videoTitle}
          description={`신청 #${selectedRequest.id}`}
          className="wake-song-admin-drawer"
        >
          <div className="wake-song-admin-detail">
            {editingId === selectedRequest.id && editState ? (
              <form
                className="wake-song-admin-edit-form"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  setEditError('');
                  editMutation.mutate({ id: selectedRequest.id, input: editState });
                }}
              >
                <label>
                  <span>YouTube 주소</span>
                  <input
                    type="url"
                    value={editState.url}
                    onChange={(event) =>
                      setEditState((current) =>
                        current ? { ...current, url: event.target.value } : current,
                      )
                    }
                    required
                  />
                </label>
                <div className="wake-song-admin-edit-grid">
                  <label>
                    <span>시작(초)</span>
                    <input
                      type="number"
                      min="0"
                      value={editState.startSeconds}
                      onChange={(event) =>
                        setEditState((current) =>
                          current ? { ...current, startSeconds: event.target.value } : current,
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>종료(초)</span>
                    <input
                      type="number"
                      min="1"
                      value={editState.endSeconds}
                      onChange={(event) =>
                        setEditState((current) =>
                          current ? { ...current, endSeconds: event.target.value } : current,
                        )
                      }
                      required
                    />
                  </label>
                </div>
                <label>
                  <span>재생 속도</span>
                  <select
                    value={editState.playbackRate}
                    onChange={(event) =>
                      setEditState((current) =>
                        current ? { ...current, playbackRate: event.target.value } : current,
                      )
                    }
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}배
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>메모</span>
                  <textarea
                    value={editState.requestNote}
                    maxLength={500}
                    onChange={(event) =>
                      setEditState((current) =>
                        current ? { ...current, requestNote: event.target.value } : current,
                      )
                    }
                  />
                </label>
                {editError ? <p className="form-error">{editError}</p> : null}
                <DialogActions
                  pending={editMutation.isPending}
                  confirmLabel="저장"
                  pendingLabel="저장 중"
                  onClose={() => {
                    setEditingId(null);
                    setEditState(null);
                    setEditError('');
                  }}
                />
              </form>
            ) : null}
            <YouTubeSegmentPlayer
              className="wake-song-admin-player"
              videoId={selectedRequest.youtubeVideoId}
              startSeconds={selectedRequest.startSeconds}
              endSeconds={selectedRequest.endSeconds}
              playbackRate={selectedRequest.playbackRate}
              title={`${selectedRequest.videoTitle} 미리보기`}
              controls={0}
              volume={playerVolume}
            />
            <label className="wake-song-admin-volume">
              <span>볼륨</span>
              <input
                type="range"
                min="0"
                max="100"
                value={playerVolume}
                onChange={(event) => setPlayerVolume(Number(event.target.value))}
              />
              <output>{playerVolume}%</output>
            </label>
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

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { ArrowDown, Check, ChevronDown, Download, ExternalLink, Pencil, X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  DialogActions,
  Dialog,
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

function editStateFromRequest(request: WakeSongRequest): WakeSongEditState {
  return {
    url: request.canonicalUrl,
    startSeconds: formatDuration(request.startSeconds),
    endSeconds: formatDuration(request.endSeconds),
    playbackRate: String(request.playbackRate),
    requestNote: request.requestNote,
  };
}

function parseEditorDuration(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatEditorDuration(value: string) {
  const seconds = parseEditorDuration(value);
  return seconds === null ? value : formatDuration(seconds);
}

function PlaybackRateSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <div
      className={`wake-song-admin-rate-select${open ? ' is-open' : ''}`}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className="wake-song-admin-rate-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}배</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="wake-song-admin-rate-select__menu" role="listbox" aria-label="재생 속도">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              className={option === value ? 'is-selected' : undefined}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <span>{option}배</span>
              {option === value ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
        startSeconds: parseEditorDuration(input.startSeconds) ?? Number.NaN,
        endSeconds: parseEditorDuration(input.endSeconds) ?? Number.NaN,
        playbackRate: Number(input.playbackRate),
        requestNote: input.requestNote,
      }),
    onSuccess: async () => {
      setSelectedId(null);
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
  const audioMutation = useMutation({
    mutationFn: wakeSongAdminApi.generateAudio,
    onSuccess: async () => {
      await refresh();
      showToast({ title: 'MP3를 준비했습니다.', tone: 'success' });
    },
    onError: (error) =>
      showToast({
        title: 'MP3를 준비하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });
  const beginEdit = (request: WakeSongRequest) => {
    setSelectedId(request.id);
    setEditingId(request.id);
    setEditState(editStateFromRequest(request));
    setEditError('');
  };
  const triggerAudioDownload = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const downloadWakeSongAudio = async (request: WakeSongRequest) => {
    const audio = request.audio ?? (await audioMutation.mutateAsync(request.id)).audio;
    triggerAudioDownload(audio.downloadUrl);
  };
  const downloadSelectedRequests = async () => {
    const selected =
      requestsQuery.data?.items.filter(
        (item) =>
          selectedIds.has(item.id) && ['APPROVED', 'SCHEDULED', 'PLAYED'].includes(item.status),
      ) ?? [];
    for (const request of selected) {
      try {
        await downloadWakeSongAudio(request);
      } catch {
        // The individual mutation already explains the failure. Keep the rest
        // of a multi-download operation usable when one item cannot be built.
      }
    }
  };

  const pageData = requestsQuery.data;

  const columns: ColumnDef<WakeSongRequest>[] = [
    {
      id: 'selection',
      header: () => (
        <TableSelectionCheckbox
          checked={
            Boolean(pageData?.items.some((item) => item.status !== 'PENDING')) &&
            pageData!.items
              .filter((item) => item.status !== 'PENDING')
              .every((item) => selectedIds.has(item.id))
          }
          label="기상곡 신청 전체 선택"
          onChange={(checked) =>
            setSelectedIds((current) => {
              const next = new Set(current);
              pageData?.items
                .filter((item) => item.status !== 'PENDING')
                .forEach((item) => (checked ? next.add(item.id) : next.delete(item.id)));
              return next;
            })
          }
        />
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <TableSelectionCheckbox
          checked={selectedIds.has(row.original.id)}
          disabled={row.original.status === 'PENDING'}
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
      // The selected-download action replaces the sortable header control.
      // Disable the wrapper for that state so the action remains a single,
      // valid button instead of becoming a nested button inside DataTable's
      // sort trigger.
      enableSorting: selectedIds.size === 0,
      header: () =>
        selectedIds.size ? (
          <button
            className="wake-song-selected-download"
            type="button"
            onClick={() => void downloadSelectedRequests()}
          >
            <Download size={14} aria-hidden="true" /> 선택 다운로드 ({selectedIds.size})
          </button>
        ) : (
          <span className="wake-song-sort-header">
            신청일 <ArrowDown size={13} aria-hidden="true" />
          </span>
        ),
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
      id: 'videoTitle',
      accessorKey: 'videoTitle',
      header: '영상',
      cell: ({ row }) => (
        <div className="wake-song-admin-title">
          <button type="button" onClick={() => beginEdit(row.original)}>
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
                label="기상곡 MP3 다운로드"
                mobileLabel="MP3 다운로드"
                variant="secondary"
                onClick={() => void downloadWakeSongAudio(request)}
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
        <Dialog
          open
          onClose={() => {
            setSelectedId(null);
            setEditingId(null);
            setEditState(null);
            setEditError('');
          }}
          title={selectedRequest.videoTitle}
          description={`신청 #${selectedRequest.id}`}
          size="lg"
          className="wake-song-admin-dialog"
        >
          <div className="wake-song-admin-detail">
            <YouTubeSegmentPlayer
              className="wake-song-admin-player"
              videoId={selectedRequest.youtubeVideoId}
              startSeconds={
                editingId === selectedRequest.id && editState
                  ? (parseEditorDuration(editState.startSeconds) ?? selectedRequest.startSeconds)
                  : selectedRequest.startSeconds
              }
              endSeconds={
                editingId === selectedRequest.id && editState
                  ? (parseEditorDuration(editState.endSeconds) ?? selectedRequest.endSeconds)
                  : selectedRequest.endSeconds
              }
              playbackRate={
                editingId === selectedRequest.id && editState
                  ? Number(editState.playbackRate) || selectedRequest.playbackRate
                  : selectedRequest.playbackRate
              }
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
            {editingId === selectedRequest.id && editState ? (
              <form
                className="wake-song-admin-edit-form"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const start = parseEditorDuration(editState.startSeconds);
                  const end = parseEditorDuration(editState.endSeconds);
                  if (start === null || end === null || end <= start) {
                    setEditError('시작과 종료를 MM:SS 형식으로 올바르게 입력해 주세요.');
                    return;
                  }
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
                {(() => {
                  const timelineMax = Math.max(1, selectedRequest.videoDurationSeconds ?? 180);
                  const start = Math.min(
                    parseEditorDuration(editState.startSeconds) ?? 0,
                    Math.max(0, timelineMax - 1),
                  );
                  const end = Math.min(
                    Math.max(parseEditorDuration(editState.endSeconds) ?? 1, start + 1),
                    timelineMax,
                  );
                  return (
                    <section className="wake-song-admin-segment-card" aria-label="재생 구간">
                      <div
                        className="wake-song-admin-timeline"
                        style={
                          {
                            '--wake-start': `${(start / timelineMax) * 100}%`,
                            '--wake-end': `${(end / timelineMax) * 100}%`,
                          } as CSSProperties
                        }
                      >
                        <div className="wake-song-admin-timeline__track" aria-hidden="true" />
                        <input
                          aria-label="시작 시각"
                          className="wake-song-admin-timeline__range is-start"
                          type="range"
                          min="0"
                          max={timelineMax}
                          value={start}
                          onChange={(event) =>
                            setEditState((current) =>
                              current
                                ? {
                                    ...current,
                                    startSeconds: formatDuration(
                                      Math.min(Number(event.target.value), end - 1),
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                        <input
                          aria-label="종료 시각"
                          className="wake-song-admin-timeline__range is-end"
                          type="range"
                          min="1"
                          max={timelineMax}
                          value={end}
                          onChange={(event) =>
                            setEditState((current) =>
                              current
                                ? {
                                    ...current,
                                    endSeconds: formatDuration(
                                      Math.max(Number(event.target.value), start + 1),
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                        <div className="wake-song-admin-timeline__labels" aria-hidden="true">
                          <span>00:00</span>
                          <span>{formatDuration(timelineMax)}</span>
                        </div>
                      </div>
                      <div className="wake-song-admin-edit-grid">
                        <label>
                          <span>시작</span>
                          <input
                            value={editState.startSeconds}
                            inputMode="numeric"
                            placeholder="00:00"
                            onChange={(event) =>
                              setEditState((current) =>
                                current
                                  ? { ...current, startSeconds: event.target.value }
                                  : current,
                              )
                            }
                            onBlur={() =>
                              setEditState((current) =>
                                current
                                  ? {
                                      ...current,
                                      startSeconds: formatEditorDuration(current.startSeconds),
                                    }
                                  : current,
                              )
                            }
                            required
                          />
                        </label>
                        <label>
                          <span>종료</span>
                          <input
                            value={editState.endSeconds}
                            inputMode="numeric"
                            placeholder="03:00"
                            onChange={(event) =>
                              setEditState((current) =>
                                current ? { ...current, endSeconds: event.target.value } : current,
                              )
                            }
                            onBlur={() =>
                              setEditState((current) =>
                                current
                                  ? {
                                      ...current,
                                      endSeconds: formatEditorDuration(current.endSeconds),
                                    }
                                  : current,
                              )
                            }
                            required
                          />
                        </label>
                        <div className="wake-song-admin-rate-field">
                          <span>재생 속도</span>
                          <PlaybackRateSelect
                            value={Number(editState.playbackRate) || 1}
                            onChange={(playbackRate) =>
                              setEditState((current) =>
                                current
                                  ? { ...current, playbackRate: String(playbackRate) }
                                  : current,
                              )
                            }
                          />
                        </div>
                      </div>
                    </section>
                  );
                })()}
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
        </Dialog>
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

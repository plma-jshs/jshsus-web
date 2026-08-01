import type { CSSProperties, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Music2,
  Pencil,
  RotateCcw,
  X,
} from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { YouTubeSegmentPlayer } from '../../components/youtube/YouTubeSegmentPlayer';
import { DataTablePagination } from '../../components/page/DataTableControls';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import {
  cancelWakeSongRequest,
  createWakeSongRequest,
  getMyWakeSongRequests,
  previewWakeSong,
  updateWakeSongRequest,
} from './api';
import {
  effectiveDuration,
  formatDuration,
  formatPlaybackRate,
  parseDuration,
  wakeSongStatusPresentation,
  WAKE_SONG_PLAYBACK_RATES,
} from './presentation';
import type { WakeSongRequest } from './types';
import { getNextWakeSongWeek } from './week';
import '../../styles/wake-songs.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type FormState = {
  url: string;
  start: string;
  end: string;
  playbackRate: number;
  requestNote: string;
};

const initialForm: FormState = {
  url: '',
  start: '00:00',
  end: '03:00',
  playbackRate: 1,
  requestNote: '',
};

const MAX_WAKE_SONG_DURATION_SECONDS = 180;

function PlaybackRateSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`wake-song-rate-select${open ? ' is-open' : ''}`}
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
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`재생 속도 ${formatPlaybackRate(value)}`}
        className="wake-song-rate-select__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{formatPlaybackRate(value)}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div aria-label="재생 속도" className="wake-song-rate-select__menu" role="listbox">
          {WAKE_SONG_PLAYBACK_RATES.map((rate) => {
            const selected = rate === value;
            return (
              <button
                aria-selected={selected}
                className={selected ? 'is-selected' : undefined}
                key={rate}
                onClick={() => {
                  onChange(rate);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                <span>{formatPlaybackRate(rate)}</span>
                {selected ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function looksLikeYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, '');
    return (
      hostname === 'youtube.com' ||
      hostname === 'music.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

function describeError(error: unknown) {
  if (error instanceof ApiError && error.payload && typeof error.payload === 'object') {
    const message = (error.payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '요청을 처리하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.';
}

export function WakeSongsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewFor, setPreviewFor] = useState('');
  const [previewAttemptFor, setPreviewAttemptFor] = useState('');
  const [page, setPage] = useState(1);

  const requestsQuery = useQuery({
    queryKey: ['wake-songs', 'me'],
    queryFn: getMyWakeSongRequests,
  });
  const previewMutation = useMutation({ mutationFn: previewWakeSong });
  const { mutate: previewMutate, reset: resetPreview } = previewMutation;
  const saveMutation = useMutation({
    mutationFn: (input: {
      editingId: number | null;
      request: Parameters<typeof createWakeSongRequest>[0];
    }) =>
      input.editingId
        ? updateWakeSongRequest(input.editingId, input.request)
        : createWakeSongRequest(input.request),
    onSuccess: async (_result, input) => {
      setForm(initialForm);
      setEditingId(null);
      setPreviewFor('');
      setPreviewAttemptFor('');
      resetPreview();
      setFormError('');
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ['wake-songs', 'me'] });
      showToast({
        title: input.editingId ? '기상곡 신청을 수정했습니다.' : '기상곡 신청을 완료했습니다.',
        tone: 'info',
      });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelWakeSongRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wake-songs', 'me'] });
    },
  });

  const startSeconds = parseDuration(form.start);
  const endSeconds = parseDuration(form.end);
  const selectedDuration =
    startSeconds === null || endSeconds === null
      ? 0
      : effectiveDuration(startSeconds, endSeconds, form.playbackRate);
  const requests = useMemo(() => requestsQuery.data?.items ?? [], [requestsQuery.data]);
  const fallbackCandidateWeek = useMemo(() => getNextWakeSongWeek(new Date()), []);
  const editingRequest = requests.find((request) => request.id === editingId);
  const candidateWeekLabel = editingRequest?.candidateWeekLabel ?? fallbackCandidateWeek.label;
  const normalizedUrl = form.url.trim();
  const preview = previewFor === normalizedUrl ? previewMutation.data : undefined;
  const timelineMax = Math.max(
    1,
    Math.floor(preview?.durationSeconds ?? MAX_WAKE_SONG_DURATION_SECONDS),
  );
  const safeStartSeconds = clamp(startSeconds ?? 0, 0, Math.max(0, timelineMax - 1));
  const safeEndSeconds = clamp(
    endSeconds ?? Math.min(timelineMax, MAX_WAKE_SONG_DURATION_SECONDS),
    safeStartSeconds + 1,
    timelineMax,
  );
  const timelineStartPercent = (safeStartSeconds / timelineMax) * 100;
  const timelineEndPercent = (safeEndSeconds / timelineMax) * 100;
  const timelineStyle = {
    '--wake-start': `${timelineStartPercent}%`,
    '--wake-end': `${timelineEndPercent}%`,
  } as CSSProperties;
  const segmentIsValid =
    startSeconds !== null &&
    endSeconds !== null &&
    endSeconds > startSeconds &&
    endSeconds <= timelineMax &&
    selectedDuration <= MAX_WAKE_SONG_DURATION_SECONDS;
  const pendingLimitReached =
    !editingId && (requestsQuery.data?.pendingCount ?? 0) >= (requestsQuery.data?.maxPending ?? 3);
  const submitDisabled =
    saveMutation.isPending || !preview || !segmentIsValid || pendingLimitReached;
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(requests.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRequests = useMemo(
    () => requests.slice((safePage - 1) * pageSize, safePage * pageSize),
    [requests, safePage],
  );

  const requestPreview = useCallback(
    (url: string) => {
      setPreviewAttemptFor(url);
      setFormError('');
      previewMutate(url, {
        onSuccess: (data) => {
          setPreviewFor(url);
          if (!data.durationSeconds) return;
          const max = Math.max(1, Math.floor(data.durationSeconds));
          setForm((current) => {
            const currentStart = parseDuration(current.start) ?? 0;
            const currentEnd =
              parseDuration(current.end) ?? Math.min(max, MAX_WAKE_SONG_DURATION_SECONDS);
            const nextStart = clamp(currentStart, 0, Math.max(0, max - 1));
            const nextEnd = clamp(currentEnd, nextStart + 1, max);
            const nextStartText = formatDuration(nextStart);
            const nextEndText = formatDuration(nextEnd);
            if (nextStartText === current.start && nextEndText === current.end) return current;
            return { ...current, start: nextStartText, end: nextEndText };
          });
        },
      });
    },
    [previewMutate],
  );

  useEffect(() => {
    if (
      !normalizedUrl ||
      previewFor === normalizedUrl ||
      previewAttemptFor === normalizedUrl ||
      previewMutation.isPending ||
      !looksLikeYouTubeUrl(normalizedUrl)
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => requestPreview(normalizedUrl), 520);
    return () => window.clearTimeout(timer);
  }, [normalizedUrl, previewAttemptFor, previewFor, previewMutation.isPending, requestPreview]);

  const handlePreview = () => {
    setFormError('');
    if (!normalizedUrl) {
      setFormError('YouTube URL을 입력해 주세요.');
      return;
    }
    requestPreview(normalizedUrl);
  };

  const updateSegment = (nextStart: number, nextEnd: number) => {
    setForm((current) => ({
      ...current,
      start: formatDuration(nextStart),
      end: formatDuration(nextEnd),
    }));
  };

  const updateSegmentStart = (nextValue: number) => {
    updateSegment(clamp(nextValue, 0, safeEndSeconds - 1), safeEndSeconds);
  };

  const updateSegmentEnd = (nextValue: number) => {
    updateSegment(safeStartSeconds, clamp(nextValue, safeStartSeconds + 1, timelineMax));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    if (startSeconds === null || endSeconds === null) {
      setFormError('재생 시각을 MM:SS 또는 H:MM:SS 형식으로 입력해 주세요.');
      return;
    }
    if (endSeconds <= startSeconds) {
      setFormError('종료 시각은 시작 시각보다 뒤여야 합니다.');
      return;
    }
    if (selectedDuration > MAX_WAKE_SONG_DURATION_SECONDS) {
      setFormError('배속을 반영한 실제 재생 시간은 최대 3분이어야 합니다.');
      return;
    }
    if (!normalizedUrl) {
      setFormError('YouTube URL을 입력해 주세요.');
      return;
    }
    if (!preview) {
      setFormError('영상 확인 후 기상곡을 신청해 주세요.');
      requestPreview(normalizedUrl);
      return;
    }
    if (!editingId && (requestsQuery.data?.pendingCount ?? 0) >= 3) {
      setFormError('대기 중인 신청은 최대 3건까지 등록할 수 있습니다.');
      return;
    }

    saveMutation.mutate({
      editingId,
      request: {
        url: normalizedUrl,
        startSeconds,
        endSeconds,
        playbackRate: form.playbackRate,
        requestNote: form.requestNote,
      },
    });
  };

  const beginEdit = (request: WakeSongRequest) => {
    const nextUrl = request.canonicalUrl;
    setEditingId(request.id);
    setForm({
      url: nextUrl,
      start: formatDuration(request.startSeconds),
      end: formatDuration(request.endSeconds),
      playbackRate: request.playbackRate,
      requestNote: request.requestNote,
    });
    setPreviewFor('');
    setPreviewAttemptFor('');
    resetPreview();
    requestPreview(nextUrl);
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const stopEditing = () => {
    setEditingId(null);
    setForm(initialForm);
    setPreviewFor('');
    setPreviewAttemptFor('');
    resetPreview();
    setFormError('');
  };

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('wakeSongs')}
      title="기상곡 신청"
      width="wide"
      variant="workspace"
    >
      <section className="wake-song-builder" aria-label="기상곡 신청 입력">
        <div className="wake-song-card">
          {editingId ? (
            <div className="wake-song-edit-bar">
              <strong>신청 내용을 수정하고 있습니다.</strong>
              <button className="detail-text-button" type="button" onClick={stopEditing}>
                <RotateCcw size={15} aria-hidden="true" /> 수정 취소
              </button>
            </div>
          ) : null}

          <p className="wake-song-candidate-week">
            <CalendarDays size={15} aria-hidden="true" />
            신청 대상 <strong>{candidateWeekLabel}</strong>
          </p>

          <form className="wake-song-form" onSubmit={handleSubmit}>
            <label className="wake-song-url-field wake-song-url-field--hero">
              <span className="sr-only">YouTube URL</span>
              <div>
                <input
                  type="url"
                  value={form.url}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, url: event.target.value }));
                    setPreviewFor('');
                    setPreviewAttemptFor('');
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
                <button
                  className="detail-secondary-button"
                  type="button"
                  onClick={handlePreview}
                  disabled={previewMutation.isPending}
                >
                  {previewMutation.isPending ? '확인 중' : '영상 확인'}
                </button>
              </div>
            </label>

            {formError ? <p className="wake-song-form-error">{formError}</p> : null}
            {previewMutation.isError ? (
              <p className="wake-song-form-error">{describeError(previewMutation.error)}</p>
            ) : null}
            {saveMutation.isError ? (
              <p className="wake-song-form-error">{describeError(saveMutation.error)}</p>
            ) : null}

            <div className={`wake-song-studio${preview ? ' has-preview' : ''}`}>
              {preview ? (
                <>
                  <div className="wake-song-player-card">
                    <YouTubeSegmentPlayer
                      className="wake-song-player"
                      videoId={preview.videoId}
                      startSeconds={safeStartSeconds}
                      endSeconds={safeEndSeconds}
                      playbackRate={form.playbackRate}
                      title={`${preview.title} 미리보기`}
                    />
                  </div>

                  <section className="wake-song-segment-card" aria-label="재생 구간">
                    <div className="wake-song-track-summary">
                      <h3>{preview.title}</h3>
                      {preview.channelTitle ? <p>{preview.channelTitle}</p> : null}
                      <div className="wake-song-media-badges">
                        {preview.durationSeconds ? (
                          <span>전체 {formatDuration(preview.durationSeconds)}</span>
                        ) : (
                          <span>길이 확인 중</span>
                        )}
                        <a href={preview.canonicalUrl} target="_blank" rel="noreferrer">
                          YouTube에서 보기 <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      </div>
                    </div>

                    <div
                      className={`wake-song-duration-chip ${
                        selectedDuration > MAX_WAKE_SONG_DURATION_SECONDS ? 'is-over' : ''
                      }`}
                      aria-live="polite"
                    >
                      <Clock3 size={16} aria-hidden="true" />
                      실제 재생 시간
                      <strong>{formatDuration(selectedDuration)}</strong>
                      <span>/ 최대 03:00</span>
                    </div>

                    <div className="wake-song-timeline" style={timelineStyle}>
                      <div className="wake-song-timeline__track" aria-hidden="true" />
                      <input
                        aria-label="시작 시각"
                        className="wake-song-timeline__range is-start"
                        max={timelineMax}
                        min={0}
                        onChange={(event) => updateSegmentStart(Number(event.target.value))}
                        step={1}
                        type="range"
                        value={safeStartSeconds}
                      />
                      <input
                        aria-label="종료 시각"
                        className="wake-song-timeline__range is-end"
                        max={timelineMax}
                        min={0}
                        onChange={(event) => updateSegmentEnd(Number(event.target.value))}
                        step={1}
                        type="range"
                        value={safeEndSeconds}
                      />
                      <div className="wake-song-timeline__labels" aria-hidden="true">
                        <span>00:00</span>
                        <span>{formatDuration(timelineMax)}</span>
                      </div>
                    </div>

                    <div className="wake-song-segment-readout">
                      <label>
                        <span>시작</span>
                        <input
                          value={form.start}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, start: event.target.value }))
                          }
                          inputMode="numeric"
                          placeholder="00:00"
                          required
                        />
                      </label>
                      <label>
                        <span>종료</span>
                        <input
                          value={form.end}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, end: event.target.value }))
                          }
                          inputMode="numeric"
                          placeholder="03:00"
                          required
                        />
                      </label>
                      <div className="wake-song-field">
                        <span>재생 속도</span>
                        <PlaybackRateSelect
                          value={form.playbackRate}
                          onChange={(playbackRate) =>
                            setForm((current) => ({
                              ...current,
                              playbackRate,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <label className="wake-song-note-field">
                      <span>신청 메모</span>
                      <input
                        type="text"
                        value={form.requestNote}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, requestNote: event.target.value }))
                        }
                        maxLength={500}
                        placeholder="담당자에게 전달할 내용이 있다면 입력해 주세요."
                      />
                    </label>

                    <button
                      className="detail-primary-button wake-song-submit"
                      type="submit"
                      disabled={submitDisabled}
                    >
                      <Music2 size={16} aria-hidden="true" />
                      {saveMutation.isPending
                        ? '저장 중'
                        : editingId
                          ? '신청 내용 저장'
                          : '기상곡 신청'}
                    </button>
                  </section>
                </>
              ) : (
                <div className="wake-song-preview-empty">
                  <Music2 size={28} aria-hidden="true" />
                  <strong>
                    {previewMutation.isPending
                      ? '영상을 확인하는 중입니다.'
                      : 'URL을 붙여넣어 주세요.'}
                  </strong>
                  <p>YouTube URL을 입력하면 미리보기가 표시됩니다.</p>
                </div>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="wake-song-history" aria-labelledby="wake-song-history-title">
        <div className="wake-song-section-title">
          <div>
            <span>내 신청</span>
          </div>
          <small>총 {requests.length}건</small>
        </div>

        {requestsQuery.isLoading ? (
          <PageState kind="loading" variant="table" title="신청 내역을 불러오는 중입니다." />
        ) : null}
        {requestsQuery.isError ? (
          <PageState
            kind="error"
            variant="table"
            title="신청 내역을 불러오지 못했습니다."
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => requestsQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}
        {requestsQuery.isSuccess && !requests.length ? (
          <PageState kind="empty" variant="table" title="신청한 기상곡이 없습니다." />
        ) : null}

        {requests.length ? (
          <div className="wake-song-history-viewport">
            <table className="workflow-table wake-song-history-table">
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '23%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">신청일</th>
                  <th scope="col">대상 주차</th>
                  <th scope="col">영상</th>
                  <th scope="col">재생 구간</th>
                  <th scope="col">상태</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((request) => {
                  const displayStatus = wakeSongStatusPresentation(request.status);
                  return (
                    <tr key={request.id}>
                      <td data-label="신청일">
                        <time dateTime={request.createdAt}>
                          {dateFormatter.format(new Date(request.createdAt))}
                        </time>
                      </td>
                      <td data-label="대상 주차">{request.candidateWeekLabel ?? '—'}</td>
                      <td className="wake-song-history-title" data-label="영상">
                        <a href={request.canonicalUrl} target="_blank" rel="noreferrer">
                          {request.videoTitle}
                        </a>
                        <small>
                          {request.channelTitle ?? 'YouTube'}
                          {request.rejectionReason ? ` · ${request.rejectionReason}` : ''}
                        </small>
                      </td>
                      <td data-label="재생 구간">
                        {formatDuration(request.startSeconds)}–{formatDuration(request.endSeconds)}
                        <small className="wake-song-table-subline">
                          {formatPlaybackRate(request.playbackRate)} · 실제{' '}
                          {formatDuration(request.effectiveDurationSeconds)}
                        </small>
                      </td>
                      <td data-label="상태">
                        <span className={`wake-song-status is-${displayStatus.tone}`}>
                          {displayStatus.label}
                        </span>
                      </td>
                      <td data-label="작업">
                        {request.status === 'PENDING' ? (
                          <div className="wake-song-table-actions">
                            <button
                              aria-label="신청 수정"
                              title="신청 수정"
                              type="button"
                              onClick={() => beginEdit(request)}
                            >
                              <Pencil size={15} aria-hidden="true" />
                            </button>
                            <button
                              aria-label="신청 취소"
                              title="신청 취소"
                              type="button"
                              onClick={() => {
                                if (window.confirm('이 기상곡 신청을 취소하시겠습니까?')) {
                                  cancelMutation.mutate(request.id);
                                }
                              }}
                              disabled={cancelMutation.isPending}
                            >
                              <X size={15} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {requests.length > pageSize ? (
          <DataTablePagination page={safePage} totalPages={totalPages} onChange={setPage} />
        ) : null}
      </section>
    </PageScaffold>
  );
}

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ManagedSchoolEvent } from '@jshsus/types';
import { api } from '../../shared/api/adminApi';
import type { SchoolEventInput } from '../../shared/api/adminApi';

const KOREA_TIME_ZONE = 'Asia/Seoul';
const MAX_RANGE_DAYS = 366;

type EventForm = {
  title: string;
  description: string;
  category: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  isHoliday: boolean;
  isPublic: boolean;
};

function dateParts(value: Date | string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function koreanDate(value: Date | string = new Date()) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function koreanDateTime(value: string) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function currentMonthRange() {
  const today = koreanDate();
  const [year, month] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function blankForm(): EventForm {
  const today = koreanDate();
  return {
    title: '',
    description: '',
    category: 'school',
    startsAt: today,
    endsAt: today,
    allDay: true,
    isHoliday: false,
    isPublic: true,
  };
}

function formFromEvent(event: ManagedSchoolEvent): EventForm {
  return {
    title: event.title,
    description: event.description ?? '',
    category: event.category,
    startsAt: event.allDay ? koreanDate(event.startsAt) : koreanDateTime(event.startsAt),
    endsAt: event.allDay ? koreanDate(event.endsAt) : koreanDateTime(event.endsAt),
    allDay: event.allDay,
    isHoliday: event.isHoliday,
    isPublic: event.isPublic,
  };
}

function apiDate(value: string, allDay: boolean) {
  if (allDay) return value.slice(0, 10);
  return `${value}${value.length === 16 ? ':00' : ''}+09:00`;
}

function eventInput(form: EventForm): SchoolEventInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    category: form.category.trim(),
    startsAt: apiDate(form.startsAt, form.allDay),
    endsAt: apiDate(form.endsAt, form.allDay),
    allDay: form.allDay,
    isHoliday: form.isHoliday,
    isPublic: form.isPublic,
  };
}

function validateEvent(form: EventForm) {
  if (!form.title.trim()) return '일정 제목을 입력해주세요.';
  if (!form.category.trim()) return '일정 분류를 입력해주세요.';
  if (!form.startsAt || !form.endsAt) return '시작일과 종료일을 모두 입력해주세요.';
  if (form.startsAt > form.endsAt) return '종료 시각은 시작 시각보다 빠를 수 없습니다.';
  return null;
}

function validateRange(range: { from: string; to: string }) {
  if (!range.from || !range.to) return '조회 시작일과 종료일을 모두 입력해주세요.';
  if (range.from > range.to) return '조회 종료일은 시작일보다 빠를 수 없습니다.';
  const days =
    (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return '조회 기간은 최대 366일까지 설정할 수 있습니다.';
  return null;
}

function formatEventPeriod(event: ManagedSchoolEvent) {
  if (event.allDay) {
    const from = koreanDate(event.startsAt);
    const to = koreanDate(event.endsAt);
    return from === to ? `${from} · 종일` : `${from} ~ ${to} · 종일`;
  }

  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `${formatter.format(new Date(event.startsAt))} ~ ${formatter.format(new Date(event.endsAt))}`;
}

export function SchoolEventsPage() {
  const queryClient = useQueryClient();
  const initialRange = currentMonthRange();
  const [rangeDraft, setRangeDraft] = useState(initialRange);
  const [range, setRange] = useState(initialRange);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['admin-school-events', range.from, range.to],
    queryFn: () => api.schoolEvents(range),
  });

  const refreshEvents = () => queryClient.invalidateQueries({ queryKey: ['admin-school-events'] });

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: SchoolEventInput }) =>
      id === null ? api.createSchoolEvent(input) : api.updateSchoolEvent(id, input),
    onSuccess: async (_, variables) => {
      setForm(blankForm());
      setEditingId(null);
      setFormError(null);
      setFeedback(variables.id === null ? '일정을 등록했습니다.' : '일정을 수정했습니다.');
      await refreshEvents();
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: number; isPublic: boolean }) =>
      api.updateSchoolEvent(id, { isPublic }),
    onSuccess: async (event) => {
      setFeedback(event.isPublic ? '일정을 공개했습니다.' : '일정을 비공개로 전환했습니다.');
      await refreshEvents();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteSchoolEvent,
    onSuccess: async () => {
      setFeedback('일정을 삭제했습니다.');
      await refreshEvents();
    },
  });

  const handleRangeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateRange(rangeDraft);
    setRangeError(error);
    if (!error) setRange(rangeDraft);
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateEvent(form);
    setFormError(error);
    setFeedback(null);
    if (!error) saveMutation.mutate({ id: editingId, input: eventInput(form) });
  };

  const startEditing = (event: ManagedSchoolEvent) => {
    setEditingId(event.id);
    setForm(formFromEvent(event));
    setFormError(null);
    setFeedback(null);
    window.requestAnimationFrame(() => {
      document.getElementById('school-event-editor')?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setForm(blankForm());
    setFormError(null);
  };

  const changeAllDay = (allDay: boolean) => {
    setForm((current) => ({
      ...current,
      allDay,
      startsAt: allDay ? current.startsAt.slice(0, 10) : `${current.startsAt.slice(0, 10)}T09:00`,
      endsAt: allDay ? current.endsAt.slice(0, 10) : `${current.endsAt.slice(0, 10)}T10:00`,
    }));
  };

  const mutationError =
    saveMutation.isError || visibilityMutation.isError || deleteMutation.isError
      ? '요청을 처리하지 못했습니다. 권한과 입력 내용을 확인한 뒤 다시 시도해주세요.'
      : null;

  return (
    <div className="admin-stack school-events-page">
      <section className="admin-panel" aria-labelledby="school-events-filter-title">
        <div className="panel-title school-events-heading">
          <div>
            <h2 id="school-events-filter-title">학사일정 관리</h2>
            <p>NEIS 일정과 함께 홈페이지에 표시할 학교 자체 일정을 관리합니다.</p>
          </div>
        </div>
        <form className="school-events-filter" onSubmit={handleRangeSubmit}>
          <label>
            <span>조회 시작일</span>
            <input
              type="date"
              value={rangeDraft.from}
              onChange={(event) =>
                setRangeDraft((current) => ({ ...current, from: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>조회 종료일</span>
            <input
              type="date"
              value={rangeDraft.to}
              onChange={(event) =>
                setRangeDraft((current) => ({ ...current, to: event.target.value }))
              }
              required
            />
          </label>
          <button className="quiet-button" type="submit">
            조회
          </button>
        </form>
        {rangeError ? (
          <p className="form-error" role="alert">
            {rangeError}
          </p>
        ) : null}
      </section>

      <section
        className="admin-panel"
        id="school-event-editor"
        aria-labelledby="event-editor-title"
      >
        <div className="panel-title school-events-heading">
          <div>
            <h2 id="event-editor-title">{editingId === null ? '새 일정 등록' : '일정 수정'}</h2>
            <p>종일 일정은 날짜만, 시간 일정은 한국 표준시 기준 시각을 입력합니다.</p>
          </div>
        </div>
        <form className="school-event-form" onSubmit={handleSave}>
          <label className="school-event-title-field">
            <span>일정 제목</span>
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              maxLength={160}
              required
            />
          </label>
          <label>
            <span>분류</span>
            <input
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
              list="school-event-categories"
              maxLength={40}
              required
            />
            <datalist id="school-event-categories">
              <option value="school">학교</option>
              <option value="academic">학사</option>
              <option value="exam">시험</option>
              <option value="event">행사</option>
              <option value="holiday">휴일</option>
            </datalist>
          </label>
          <label>
            <span>시작{form.allDay ? '일' : ' 시각'}</span>
            <input
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.startsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, startsAt: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>종료{form.allDay ? '일' : ' 시각'}</span>
            <input
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.endsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, endsAt: event.target.value }))
              }
              required
            />
          </label>
          <label className="school-event-description-field">
            <span>설명</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              maxLength={5000}
              rows={4}
              placeholder="홈페이지에 함께 표시할 설명을 입력하세요."
            />
          </label>
          <fieldset className="school-event-options">
            <legend>일정 속성</legend>
            <label>
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => changeAllDay(event.target.checked)}
              />
              <span>종일 일정</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.isHoliday}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isHoliday: event.target.checked }))
                }
              />
              <span>휴일로 표시</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isPublic: event.target.checked }))
                }
              />
              <span>홈페이지에 공개</span>
            </label>
          </fieldset>
          <div className="school-event-form-actions">
            <button className="primary-button" type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? '저장 중'
                : editingId === null
                  ? '일정 등록'
                  : '변경사항 저장'}
            </button>
            {editingId !== null ? (
              <button
                className="quiet-button"
                type="button"
                onClick={cancelEditing}
                disabled={saveMutation.isPending}
              >
                수정 취소
              </button>
            ) : null}
          </div>
        </form>
        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
      </section>

      <section className="admin-panel" aria-labelledby="school-event-list-title">
        <div className="panel-title school-events-heading">
          <div>
            <h2 id="school-event-list-title">등록된 학교 일정</h2>
            <p>
              {range.from}부터 {range.to}까지의 일정입니다.
            </p>
          </div>
          {eventsQuery.data ? <strong>{eventsQuery.data.length}건</strong> : null}
        </div>

        <div className="school-event-feedback" aria-live="polite">
          {feedback ? <p>{feedback}</p> : null}
          {mutationError ? (
            <p className="form-error" role="alert">
              {mutationError}
            </p>
          ) : null}
        </div>

        {eventsQuery.isLoading ? (
          <p className="empty-text" role="status">
            일정을 불러오는 중입니다.
          </p>
        ) : eventsQuery.isError ? (
          <div className="school-events-query-error" role="alert">
            <p>일정을 불러오지 못했습니다. 접근 권한과 서버 상태를 확인해주세요.</p>
            <button className="quiet-button" type="button" onClick={() => eventsQuery.refetch()}>
              다시 시도
            </button>
          </div>
        ) : eventsQuery.data?.length ? (
          <div className="school-event-list">
            {eventsQuery.data.map((event) => {
              const toggling =
                visibilityMutation.isPending && visibilityMutation.variables?.id === event.id;
              const deleting = deleteMutation.isPending && deleteMutation.variables === event.id;
              return (
                <article className="school-event-row" key={event.id}>
                  <div className="school-event-row-main">
                    <div className="school-event-badges">
                      <span
                        className={event.isPublic ? 'event-badge public' : 'event-badge private'}
                      >
                        {event.isPublic ? '공개' : '비공개'}
                      </span>
                      <span className="event-badge category">{event.category}</span>
                      {event.isHoliday ? <span className="event-badge holiday">휴일</span> : null}
                    </div>
                    <h3>{event.title}</h3>
                    <p>{formatEventPeriod(event)}</p>
                    {event.description ? <span>{event.description}</span> : null}
                  </div>
                  <div className="school-event-row-actions">
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={() => startEditing(event)}
                      disabled={deleting}
                      aria-label={`${event.title} 수정`}
                    >
                      수정
                    </button>
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={() =>
                        visibilityMutation.mutate({ id: event.id, isPublic: !event.isPublic })
                      }
                      disabled={toggling || deleting}
                      aria-label={`${event.title} ${event.isPublic ? '비공개로 전환' : '공개'}`}
                    >
                      {toggling ? '처리 중' : event.isPublic ? '비공개 전환' : '공개'}
                    </button>
                    <button
                      className="table-action"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`'${event.title}' 일정을 삭제할까요?`)) {
                          deleteMutation.mutate(event.id);
                        }
                      }}
                      disabled={deleting || toggling}
                      aria-label={`${event.title} 삭제`}
                    >
                      {deleting ? '삭제 중' : '삭제'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-text">선택한 기간에 등록된 학교 일정이 없습니다.</p>
        )}
      </section>
    </div>
  );
}

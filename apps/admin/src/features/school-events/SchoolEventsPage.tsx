import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Dialog, Drawer, RowActionButton, RowActions, useToast } from '../../components/ui';
import {
  api,
  type AdminSchoolCalendarEvent,
  type SchoolEventInput,
} from '../../shared/api/adminApi';
import './school-events.css';

const KOREA_TIME_ZONE = 'Asia/Seoul';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

function monthKey(value = koreanDate()) {
  return value.slice(0, 7);
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftDate(value: string, offset: number) {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return shifted.toISOString().slice(0, 10);
}

function calendarDays(month: string) {
  const first = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const weekCount = Math.max(5, Math.ceil((weekday + lastDay) / 7));
  const start = shiftDate(first, -weekday);
  return Array.from({ length: weekCount * 7 }, (_, index) => shiftDate(start, index));
}

function calendarWeeks(days: string[]) {
  return Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}년 ${monthNumber}월`;
}

function blankForm(date = koreanDate()): EventForm {
  return {
    title: '',
    description: '',
    category: 'school',
    startsAt: date,
    endsAt: date,
    allDay: true,
    isHoliday: false,
    isPublic: true,
  };
}

function formFromEvent(event: AdminSchoolCalendarEvent): EventForm {
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
    category: form.category,
    startsAt: apiDate(form.startsAt, form.allDay),
    endsAt: apiDate(form.endsAt, form.allDay),
    allDay: form.allDay,
    isHoliday: form.isHoliday,
    isPublic: form.isPublic,
  };
}

function validateEvent(form: EventForm) {
  if (!form.title.trim()) return '일정 제목을 입력해 주세요.';
  if (!form.startsAt || !form.endsAt) return '시작일과 종료일을 입력해 주세요.';
  if (form.startsAt > form.endsAt) return '종료 시각은 시작 시각보다 빠를 수 없습니다.';
  return null;
}

function formatPeriod(event: AdminSchoolCalendarEvent) {
  const start = koreanDate(event.startsAt);
  const end = koreanDate(event.endsAt);
  if (event.allDay) return start === end ? `${start} 종일` : `${start} – ${end}`;
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `${formatter.format(new Date(event.startsAt))} – ${formatter.format(new Date(event.endsAt))}`;
}

function occursOn(event: AdminSchoolCalendarEvent, date: string) {
  return koreanDate(event.startsAt) <= date && koreanDate(event.endsAt) >= date;
}

function eventTone(event: AdminSchoolCalendarEvent) {
  return event.isHoliday ? 'holiday' : 'schedule';
}

function eventRange(event: AdminSchoolCalendarEvent) {
  return {
    startsAt: koreanDate(event.startsAt),
    endsAt: koreanDate(event.endsAt),
  };
}

function weekEventSegments(
  week: string[],
  events: AdminSchoolCalendarEvent[],
  gridStartDate: string,
) {
  const weekStart = week[0]!;
  const weekEnd = week[6]!;
  const lanes: Array<Array<{ end: number; start: number }>> = [];
  return [...events]
    .sort((left, right) => {
      const leftRange = eventRange(left);
      const rightRange = eventRange(right);
      return (
        leftRange.startsAt.localeCompare(rightRange.startsAt) ||
        rightRange.endsAt.localeCompare(leftRange.endsAt) ||
        left.title.localeCompare(right.title, 'ko-KR')
      );
    })
    .flatMap((event) => {
      const range = eventRange(event);
      if (range.startsAt > weekEnd || range.endsAt < weekStart) return [];

      const segmentStart = range.startsAt < weekStart ? weekStart : range.startsAt;
      const segmentEnd = range.endsAt > weekEnd ? weekEnd : range.endsAt;
      const start = week.indexOf(segmentStart);
      const end = week.indexOf(segmentEnd);
      if (start < 0 || end < 0) return [];

      const laneIndex = lanes.findIndex((lane) =>
        lane.every((occupied) => end < occupied.start || start > occupied.end),
      );
      const lane = laneIndex >= 0 ? laneIndex : lanes.length;
      lanes[lane] = [...(lanes[lane] ?? []), { end, start }];
      const firstVisibleStart = range.startsAt < gridStartDate ? gridStartDate : range.startsAt;

      return [
        {
          continuesAfter: range.endsAt > segmentEnd,
          continuesBefore: range.startsAt < segmentStart,
          endColumn: end + 1,
          event,
          isMultiDay: range.startsAt !== range.endsAt,
          lane,
          showLabel: segmentStart === firstVisibleStart,
          startColumn: start + 1,
        },
      ];
    });
}

function eventCategoryLabel(event: AdminSchoolCalendarEvent) {
  if (event.isHoliday) return '공휴일·휴일';
  const labels: Record<string, string> = {
    school: '학교 일정',
    academic: '학사 일정',
    exam: '시험',
    event: '행사',
  };
  return labels[event.category] ?? '학교 일정';
}

function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function SchoolEventsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const today = koreanDate();
  const [month, setMonth] = useState(monthKey(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [source, setSource] = useState<'all' | 'homepage' | 'managed'>('all');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EventForm>(() => blankForm(today));
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminSchoolCalendarEvent | null>(null);

  const days = useMemo(() => calendarDays(month), [month]);
  const weeks = useMemo(() => calendarWeeks(days), [days]);
  const range = { from: days[0]!, to: days[days.length - 1]! };
  const calendarQuery = useQuery({
    queryKey: ['admin-school-calendar', range.from, range.to],
    queryFn: () => api.schoolCalendar(range),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-school-calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-school-events'] }),
    ]);

  const visibleEvents = useMemo(
    () =>
      (calendarQuery.data?.events ?? []).filter((event) => {
        if (source === 'homepage' && event.editable) return false;
        if (source === 'managed' && !event.editable) return false;
        if (visibility === 'public' && !event.isPublic) return false;
        if (visibility === 'private' && event.isPublic) return false;
        return true;
      }),
    [calendarQuery.data?.events, source, visibility],
  );
  const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId) ?? null;
  const selectedDateEvents = visibleEvents.filter((event) => occursOn(event, selectedDate));

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: SchoolEventInput }) =>
      id === null ? api.createSchoolEvent(input) : api.updateSchoolEvent(id, input),
    onSuccess: async () => {
      setEditorOpen(false);
      setEditingId(null);
      setFormError(null);
      await refresh();
      showToast({ title: '일정을 저장했습니다.', tone: 'success' });
    },
    onError: (error) =>
      showToast({
        title: '일정을 저장하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });
  const visibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: number; isPublic: boolean }) =>
      api.updateSchoolEvent(id, { isPublic }),
    onSuccess: async (_, variables) => {
      await refresh();
      showToast({
        title: variables.isPublic ? '일정을 공개했습니다.' : '일정을 비공개로 전환했습니다.',
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '공개 상태를 변경하지 못했습니다.', tone: 'danger' }),
  });
  const deleteMutation = useMutation({
    mutationFn: api.deleteSchoolEvent,
    onSuccess: async () => {
      setDeleteTarget(null);
      setSelectedEventId(null);
      await refresh();
      showToast({ title: '일정을 삭제했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '일정을 삭제하지 못했습니다.', tone: 'danger' }),
  });

  const moveMonth = (offset: number) => {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelectedDate(`${next}-01`);
    setSelectedEventId(null);
  };
  const openCreate = (date = selectedDate) => {
    setEditingId(null);
    setForm(blankForm(date));
    setFormError(null);
    setEditorOpen(true);
  };
  const openEdit = (event: AdminSchoolCalendarEvent) => {
    if (!event.editable || !event.managedId) return;
    setSelectedEventId(null);
    setEditingId(event.managedId);
    setForm(formFromEvent(event));
    setFormError(null);
    setEditorOpen(true);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateEvent(form);
    setFormError(error);
    if (!error) saveMutation.mutate({ id: editingId, input: eventInput(form) });
  };
  const changeAllDay = (allDay: boolean) =>
    setForm((current) => ({
      ...current,
      allDay,
      startsAt: allDay ? current.startsAt.slice(0, 10) : `${current.startsAt.slice(0, 10)}T09:00`,
      endsAt: allDay ? current.endsAt.slice(0, 10) : `${current.endsAt.slice(0, 10)}T10:00`,
    }));

  return (
    <div className="school-calendar-page">
      <section className="admin-panel school-calendar-panel">
        <div className="school-calendar-toolbar">
          <div className="school-calendar-navigation">
            <button
              className="quiet-button icon-button"
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="이전 달"
            >
              <ChevronLeft size={18} />
            </button>
            <h2>{monthLabel(month)}</h2>
            <button
              className="quiet-button icon-button"
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="다음 달"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="school-calendar-actions">
            <label>
              <span className="sr-only">일정 출처</span>
              <select
                value={source}
                onChange={(event) => setSource(event.target.value as typeof source)}
              >
                <option value="all">모든 일정</option>
                <option value="homepage">홈페이지 연동</option>
                <option value="managed">직접 등록</option>
              </select>
            </label>
            <label>
              <span className="sr-only">공개 상태</span>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as typeof visibility)}
              >
                <option value="all">전체</option>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
            </label>
            <button className="primary-button" type="button" onClick={() => openCreate()}>
              <Plus size={16} /> 새 일정
            </button>
          </div>
        </div>

        <div className="school-calendar-legend" aria-label="일정 범례">
          <span>
            <i className="source-dot holiday" />
            공휴일·휴일
          </span>
          <span>
            <i className="source-dot schedule" />
            학교 일정
          </span>
          {calendarQuery.data && calendarQuery.data.availability !== 'available' ? (
            <em>일부 일정 제공처에 연결하지 못했습니다.</em>
          ) : null}
        </div>

        <div className="school-calendar-workspace">
          <div className="school-calendar-main">
            <div className="school-calendar-grid" aria-label={`${monthLabel(month)} 달력`}>
              {WEEKDAYS.map((weekday, index) => (
                <div className={`school-calendar-weekday weekday-${index}`} key={weekday}>
                  {weekday}
                </div>
              ))}
              <div className="school-calendar-month">
                {weeks.map((week) => (
                  <div className="school-calendar-week" key={week[0]}>
                    <div className="school-calendar-week-days">
                      {week.map((date) => {
                        const dateEvents = visibleEvents.filter((event) => occursOn(event, date));
                        const inMonth = date.startsWith(month);
                        const isSelected = date === selectedDate;
                        const isToday = date === today;
                        const weekday = weekdayOf(date);
                        const isHoliday = dateEvents.some((event) => event.isHoliday);
                        const hiddenEventCount = Math.max(0, dateEvents.length - 3);
                        return (
                          <article
                            className={`school-calendar-day${inMonth ? '' : ' outside'}${isSelected ? ' selected' : ''}${isHoliday ? ' is-holiday' : ''}${weekday === 0 ? ' is-sunday' : ''}${weekday === 6 ? ' is-saturday' : ''}`}
                            key={date}
                          >
                            <button
                              className={`school-calendar-date${isToday ? ' today' : ''}`}
                              type="button"
                              onClick={() => {
                                setSelectedDate(date);
                                setSelectedEventId(null);
                              }}
                              aria-label={`${date} 선택`}
                            >
                              {Number(date.slice(-2))}
                            </button>
                            {hiddenEventCount ? (
                              <span className="school-calendar-more">+{hiddenEventCount}</span>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                    <div className="school-calendar-events">
                      {weekEventSegments(week, visibleEvents, days[0]!)
                        .filter((segment) => segment.lane < 3)
                        .map((segment) => (
                          <button
                            className={`school-calendar-event ${eventTone(segment.event)}${
                              segment.event.isPublic ? '' : ' private'
                            }${segment.isMultiDay ? ' is-multi-day' : ''}${
                              segment.showLabel ? '' : ' is-continuation'
                            }${segment.continuesBefore ? ' starts-before' : ''}${
                              segment.continuesAfter ? ' ends-after' : ''
                            }${segment.endColumn === 7 ? ' ends-week' : ''}`}
                            type="button"
                            key={`${segment.event.id}-${week[0]}`}
                            title={segment.event.title}
                            style={{
                              gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
                              gridRow: segment.lane + 1,
                            }}
                            onClick={() => {
                              const range = eventRange(segment.event);
                              setSelectedDate(range.startsAt);
                              setSelectedEventId(segment.event.id);
                            }}
                          >
                            {segment.showLabel ? segment.event.title : null}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {calendarQuery.isLoading ? (
              <p className="calendar-status">달력을 불러오는 중입니다.</p>
            ) : null}
            {calendarQuery.isError ? (
              <div className="calendar-status error" role="alert">
                <span>학사일정을 불러오지 못했습니다.</span>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => calendarQuery.refetch()}
                >
                  다시 시도
                </button>
              </div>
            ) : null}
          </div>
          <aside className="school-calendar-side" aria-label="선택한 날짜 일정">
            <section className="selected-day-panel">
              <div className="panel-title">
                <div>
                  <h2>{selectedDate}</h2>
                  <span>{selectedDateEvents.length}건</span>
                </div>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => openCreate(selectedDate)}
                >
                  <Plus size={15} /> 일정 추가
                </button>
              </div>
              {selectedDateEvents.length ? (
                <div className="selected-day-list">
                  {selectedDateEvents.map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      onClick={() => setSelectedEventId(event.id)}
                    >
                      <i className={`source-dot ${eventTone(event)}`} />
                      <strong>{event.title}</strong>
                      <span>{formatPeriod(event)}</span>
                      {!event.isPublic ? <em>비공개</em> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty-text compact-empty">등록된 일정이 없습니다.</p>
              )}
            </section>
          </aside>
        </div>
      </section>

      <Drawer
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEventId(null)}
        title={selectedEvent?.title ?? '일정 상세'}
        description={
          selectedEvent
            ? `${eventCategoryLabel(selectedEvent)} · ${
                selectedEvent.editable ? '직접 등록' : '홈페이지 연동 · 읽기 전용'
              }`
            : undefined
        }
        footer={
          selectedEvent?.editable && selectedEvent.managedId ? (
            <RowActions className="button-row">
              <RowActionButton
                icon={<Pencil aria-hidden="true" />}
                label={`${selectedEvent.title} 수정`}
                onClick={() => openEdit(selectedEvent)}
              />
              <RowActionButton
                icon={
                  selectedEvent.isPublic ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )
                }
                label={selectedEvent.isPublic ? '비공개 전환' : '공개'}
                variant="primary"
                disabled={visibilityMutation.isPending}
                onClick={() =>
                  visibilityMutation.mutate({
                    id: selectedEvent.managedId!,
                    isPublic: !selectedEvent.isPublic,
                  })
                }
              />
              <RowActionButton
                icon={<Trash2 aria-hidden="true" />}
                label={`${selectedEvent.title} 삭제`}
                variant="danger"
                onClick={() => {
                  setSelectedEventId(null);
                  setDeleteTarget(selectedEvent);
                }}
              />
            </RowActions>
          ) : undefined
        }
      >
        {selectedEvent ? (
          <dl className="calendar-event-detail">
            <div>
              <dt>일시</dt>
              <dd>{formatPeriod(selectedEvent)}</dd>
            </div>
            <div>
              <dt>구분</dt>
              <dd>{eventCategoryLabel(selectedEvent)}</dd>
            </div>
            <div>
              <dt>출처</dt>
              <dd>{selectedEvent.editable ? '직접 등록' : '홈페이지 연동'}</dd>
            </div>
            {selectedEvent.editable ? (
              <div>
                <dt>공개</dt>
                <dd>{selectedEvent.isPublic ? '공개' : '비공개'}</dd>
              </div>
            ) : null}
            {selectedEvent.description ? (
              <div className="full">
                <dt>설명</dt>
                <dd>{selectedEvent.description}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Drawer>

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId === null ? '새 일정' : '일정 수정'}
        size="lg"
        footer={
          <div className="button-row">
            <button className="quiet-button" type="button" onClick={() => setEditorOpen(false)}>
              취소
            </button>
            <button
              className="primary-button"
              type="submit"
              form="school-event-form"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? '저장 중' : '저장'}
            </button>
          </div>
        }
      >
        <form className="calendar-event-form" id="school-event-form" onSubmit={submit}>
          <label className="full">
            <span>제목</span>
            <input
              autoFocus
              value={form.title}
              maxLength={160}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>분류</span>
            <select
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            >
              <option value="school">학교</option>
              <option value="academic">학사</option>
              <option value="exam">시험</option>
              <option value="event">행사</option>
              <option value="holiday">휴일</option>
            </select>
          </label>
          <label className="checkbox-row compact-check">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(event) => changeAllDay(event.target.checked)}
            />
            <span>종일 일정</span>
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
          <label className="full">
            <span>설명</span>
            <textarea
              value={form.description}
              maxLength={5000}
              rows={4}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <div className="calendar-event-options full">
            <label className="checkbox-row compact-check">
              <input
                type="checkbox"
                checked={form.isHoliday}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isHoliday: event.target.checked }))
                }
              />
              <span>휴일로 표시</span>
            </label>
            <label className="checkbox-row compact-check">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isPublic: event.target.checked }))
                }
              />
              <span>홈페이지에 공개</span>
            </label>
          </div>
          {formError ? (
            <p className="form-error full" role="alert">
              {formError}
            </p>
          ) : null}
          {saveMutation.isError ? (
            <p className="form-error full" role="alert">
              일정을 저장하지 못했습니다.
            </p>
          ) : null}
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="일정 삭제"
        description={deleteTarget ? `‘${deleteTarget.title}’ 일정을 삭제합니다.` : undefined}
        size="sm"
        footer={
          <div className="button-row">
            <button className="quiet-button" type="button" onClick={() => setDeleteTarget(null)}>
              취소
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteTarget?.managedId && deleteMutation.mutate(deleteTarget.managedId)
              }
            >
              {deleteMutation.isPending ? '삭제 중' : '삭제'}
            </button>
          </div>
        }
      >
        <p>삭제한 일정은 복구할 수 없습니다.</p>
      </Dialog>
    </div>
  );
}

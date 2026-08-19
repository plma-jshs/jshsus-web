import type { ChangeEvent, FormEvent, MouseEvent, TouchEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AdminSelect,
  ConfirmDialog,
  Dialog,
  DialogActions,
  Drawer,
  EmptyState,
  RowActionButton,
  RowActions,
  useToast,
} from '../../components/ui';
import {
  api,
  type AdminSchoolCalendarEvent,
  type SchoolEventInput,
} from '../../shared/api/adminApi';
import { formatAdminDate } from '../../shared/lib/date';
import './school-events.css';

const KOREA_TIME_ZONE = 'Asia/Seoul';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type EventForm = {
  title: string;
  description: string;
  category: CalendarEventCategory;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  isPublic: boolean;
};

type CalendarEventCategory = 'school' | 'observance' | 'holiday';

const CALENDAR_EVENT_CATEGORIES: ReadonlyArray<{
  value: CalendarEventCategory;
  label: string;
  description: string;
  tone: string;
}> = [
  {
    value: 'school',
    label: '학사 일정',
    description: '기말고사, 입시설명회, 방학, 귀가 등',
    tone: 'school',
  },
  {
    value: 'observance',
    label: '기념일·절기',
    description: '제헌절, 국군의 날, 절기 등',
    tone: 'observance',
  },
  {
    value: 'holiday',
    label: '공휴일·휴업일',
    description: '광복절, 추석, 재량휴업일, 개교기념일 등',
    tone: 'holiday',
  },
];

type JsonImportPreview = {
  fileName: string;
  events: unknown[];
  replaceRange: boolean;
};
type CalendarPopover = {
  title: string;
  period: string;
  tone: 'bar' | 'schedule' | 'holiday';
  x: number;
  y: number;
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

function monthOnlyLabel(month: string) {
  return `${Number(month.split('-')[1])}월`;
}

function blankForm(date = koreanDate()): EventForm {
  return {
    title: '',
    description: '',
    category: 'school',
    startsAt: date,
    endsAt: date,
    allDay: true,
    isPublic: true,
  };
}

function normalizeCategory(category: string, isHoliday: boolean): CalendarEventCategory {
  if (isHoliday || category === 'holiday') return 'holiday';
  return category === 'observance' ? 'observance' : 'school';
}

function formFromEvent(event: AdminSchoolCalendarEvent): EventForm {
  return {
    title: event.title,
    description: event.description ?? '',
    category: normalizeCategory(event.category, event.isHoliday),
    startsAt: event.allDay ? koreanDate(event.startsAt) : koreanDateTime(event.startsAt),
    endsAt: event.allDay ? koreanDate(event.endsAt) : koreanDateTime(event.endsAt),
    allDay: event.allDay,
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
    isHoliday: form.category === 'holiday',
    isPublic: form.isPublic,
  };
}

function validateEvent(form: EventForm) {
  if (!form.title.trim()) return '일정 제목을 입력해 주세요.';
  if (!form.startsAt || !form.endsAt) return '시작일과 종료일을 입력해 주세요.';
  if (form.startsAt > form.endsAt) return '종료 시각은 시작 시각보다 빠를 수 없습니다.';
  return null;
}

function formatCalendarDate(date: string, _includeYear = true) {
  return formatAdminDate(`${date}T00:00:00+09:00`, {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

function formatPeriod(event: AdminSchoolCalendarEvent) {
  const start = koreanDate(event.startsAt);
  const end = koreanDate(event.endsAt);
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  if (event.allDay) {
    return start === end
      ? `${formatCalendarDate(start, false)} 종일`
      : `${formatCalendarDate(start, crossesYear)} 〜 ${formatCalendarDate(end, crossesYear)} 종일`;
  }
  return start === end
    ? `${formatCalendarDate(start, false)} ${dateTimeFormatter.format(new Date(event.startsAt))} 〜 ${dateTimeFormatter.format(new Date(event.endsAt))}`
    : `${formatCalendarDate(start, crossesYear)} ${dateTimeFormatter.format(new Date(event.startsAt))} 〜 ${formatCalendarDate(end, crossesYear)} ${dateTimeFormatter.format(new Date(event.endsAt))}`;
}

function occursOn(event: AdminSchoolCalendarEvent, date: string) {
  return koreanDate(event.startsAt) <= date && koreanDate(event.endsAt) >= date;
}

function eventTone(event: AdminSchoolCalendarEvent) {
  const category = normalizeCategory(event.category, event.isHoliday);
  if (category === 'holiday') return 'holiday';
  return category === 'observance' ? 'schedule' : 'bar';
}

function isInlineCalendarEvent(event: AdminSchoolCalendarEvent) {
  const range = eventRange(event);
  return range.startsAt === range.endsAt && event.category === 'observance';
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

      const isLaneFree = (lane: number) =>
        (lanes[lane] ?? []).every((occupied) => end < occupied.start || start > occupied.end);
      let lane = 0;
      while (!isLaneFree(lane)) lane += 1;
      lanes[lane] = [...(lanes[lane] ?? []), { end, start }];
      const firstVisibleStart = range.startsAt < gridStartDate ? gridStartDate : range.startsAt;

      return [
        {
          continuesAfter: range.endsAt > segmentEnd,
          continuesBefore: range.startsAt < segmentStart,
          endColumn: end + 1,
          event,
          isMultiDay: range.startsAt !== range.endsAt,
          isInline: isInlineCalendarEvent(event),
          lane,
          showLabel: segmentStart === firstVisibleStart,
          startColumn: start + 1,
        },
      ];
    });
}

function clickedSegmentDate(
  event: MouseEvent<HTMLButtonElement>,
  week: string[],
  startColumn: number,
  endColumn: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const length = endColumn - startColumn + 1;
  const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  const offset = Math.min(length - 1, Math.max(0, Math.floor(ratio * length)));
  return week[startColumn - 1 + offset] ?? week[startColumn - 1]!;
}

function eventCategoryLabel(event: AdminSchoolCalendarEvent) {
  return CALENDAR_EVENT_CATEGORIES.find(
    (category) => category.value === normalizeCategory(event.category, event.isHoliday),
  )!.label;
}

function CalendarCategorySelect({
  value,
  onChange,
}: {
  value: CalendarEventCategory;
  onChange: (value: CalendarEventCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = CALENDAR_EVENT_CATEGORIES.find((category) => category.value === value)!;

  return (
    <div
      className={`calendar-category-select${open ? ' is-open' : ''}`}
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
        className="calendar-category-select__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          <i className={`calendar-category-dot is-${selected.tone}`} aria-hidden="true" />
          {selected.label}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="calendar-category-select__menu" role="listbox" aria-label="일정 분류">
          {CALENDAR_EVENT_CATEGORIES.map((category) => (
            <button
              aria-selected={category.value === value}
              className={category.value === value ? 'is-selected' : undefined}
              key={category.value}
              onClick={() => {
                onChange(category.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <i className={`calendar-category-dot is-${category.tone}`} aria-hidden="true" />
              <span>
                <strong>{category.label}</strong>
                <small>{category.description}</small>
              </span>
              {category.value === value ? <Check size={16} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function isMobileCalendar() {
  return window.matchMedia('(max-width: 767px)').matches;
}

export function SchoolEventsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const today = koreanDate();
  const [month, setMonth] = useState(monthKey(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [mobileDayOpen, setMobileDayOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EventForm>(() => blankForm(today));
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminSchoolCalendarEvent | null>(null);
  const [jsonImport, setJsonImport] = useState<JsonImportPreview | null>(null);
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [popover, setPopover] = useState<CalendarPopover | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [slideDirection, setSlideDirection] = useState<'previous' | 'next' | null>(null);

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
        if (visibility === 'public' && !event.isPublic) return false;
        if (visibility === 'private' && event.isPublic) return false;
        return true;
      }),
    [calendarQuery.data?.events, visibility],
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
  const importJsonMutation = useMutation({
    mutationFn: api.importSchoolEventsJson,
    onSuccess: async (result) => {
      setJsonImport(null);
      setJsonImportError(null);
      await refresh();
      showToast({
        title: '학사일정 JSON을 반영했습니다.',
        description: `${result.from}~${result.to} / ${result.importedCount}건 추가${
          result.replacedCount ? `, ${result.replacedCount}건 교체` : ''
        }`,
        tone: 'success',
      });
    },
    onError: (error) =>
      showToast({
        title: '학사일정 JSON을 반영하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });

  const moveMonth = (offset: number) => {
    setSlideDirection(offset < 0 ? 'previous' : 'next');
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelectedDate(`${next}-01`);
    setSelectedEventId(null);
    setMobileDayOpen(false);
  };
  const handleCalendarTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleCalendarTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    moveMonth(deltaX < 0 ? 1 : -1);
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
  const changeJsonImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const events =
        Array.isArray(parsed) || !parsed || typeof parsed !== 'object'
          ? parsed
          : (parsed as { events?: unknown }).events;
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error('events 배열이 있는 JSON 파일을 선택해 주세요.');
      }
      setJsonImport({ fileName: file.name, events, replaceRange: false });
      setJsonImportError(null);
    } catch (error) {
      setJsonImport(null);
      setJsonImportError(error instanceof Error ? error.message : 'JSON 파일을 읽지 못했습니다.');
    }
  };
  const submitJsonImport = () => {
    if (!jsonImport) return;
    importJsonMutation.mutate(jsonImport);
  };

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
            <h2>
              <span className="school-calendar-month-full">{monthLabel(month)}</span>
              <span className="school-calendar-month-mobile">{monthOnlyLabel(month)}</span>
            </h2>
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
              <span className="sr-only">공개 상태</span>
              <AdminSelect
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as typeof visibility)}
              >
                <option value="all">전체</option>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </AdminSelect>
            </label>
            <button className="primary-button" type="button" onClick={() => openCreate()}>
              새 일정
            </button>
            <label className="quiet-button school-calendar-upload-button">
              <Upload size={16} />
              업로드
              <input accept="application/json,.json" type="file" onChange={changeJsonImportFile} />
            </label>
          </div>
        </div>

        <div className="school-calendar-legend" aria-label="일정 범례">
          <span>
            <i className="source-dot holiday" />
            공휴일·휴업일
          </span>
          <span>
            <i className="source-dot schedule" />
            기념일·절기
          </span>
          <span>
            <i className="source-dot bar" />
            학사 일정
          </span>
          {calendarQuery.data && calendarQuery.data.availability !== 'available' ? (
            <em>일정 DB를 조회하지 못했습니다.</em>
          ) : null}
          {calendarQuery.isSuccess && calendarQuery.data.events.length === 0 ? (
            <em className="is-empty-month">등록된 일정 정보가 없는 달입니다.</em>
          ) : null}
        </div>

        {jsonImport || jsonImportError ? (
          <div className="school-calendar-import-panel">
            {jsonImport ? (
              <>
                <div>
                  <strong>{jsonImport.fileName}</strong>
                  <span>{jsonImport.events.length}건 업로드 대기</span>
                </div>
                <label className="checkbox-row compact-check">
                  <input
                    type="checkbox"
                    checked={jsonImport.replaceRange}
                    onChange={(event) =>
                      setJsonImport((current) =>
                        current ? { ...current, replaceRange: event.target.checked } : current,
                      )
                    }
                  />
                  <span>파일 날짜 범위의 기존 일정을 먼저 삭제하고 교체</span>
                </label>
                <button
                  className="primary-button"
                  type="button"
                  disabled={importJsonMutation.isPending}
                  onClick={submitJsonImport}
                >
                  {importJsonMutation.isPending ? '반영 중' : '반영'}
                </button>
                <button className="quiet-button" type="button" onClick={() => setJsonImport(null)}>
                  취소
                </button>
              </>
            ) : (
              <p className="form-error" role="alert">
                {jsonImportError}
              </p>
            )}
          </div>
        ) : null}

        <div className="school-calendar-workspace">
          <div className="school-calendar-main">
            <div
              key={month}
              className={`school-calendar-grid${slideDirection ? ` is-${slideDirection}` : ''}`}
              aria-label={`${monthLabel(month)} 달력`}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setSlideDirection(null);
              }}
              onTouchStart={handleCalendarTouchStart}
              onTouchEnd={handleCalendarTouchEnd}
            >
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
                        // A selected day always belongs to the visible month;
                        // adjacent-month cells must remain visually dimmed even
                        // when their weekend/holiday styles are present.
                        const isSelected = inMonth && date === selectedDate;
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
                              className="school-calendar-day-trigger"
                              type="button"
                              onClick={() => {
                                setSelectedDate(date);
                                setSelectedEventId(null);
                                if (isMobileCalendar()) setMobileDayOpen(dateEvents.length > 0);
                              }}
                              aria-label={`${date} 선택`}
                            >
                              <span className={`school-calendar-date${isToday ? ' today' : ''}`}>
                                {Number(date.slice(-2))}
                              </span>
                            </button>
                            {hiddenEventCount ? (
                              <span className="school-calendar-more">+{hiddenEventCount}</span>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                    <div className="school-calendar-events">
                      {calendarQuery.isLoading
                        ? [
                            { column: '1 / 4', row: 1 },
                            { column: '5 / 8', row: 2 },
                          ].map((placeholder) => (
                            <span
                              className="school-calendar-event-skeleton"
                              key={`${week[0]}-${placeholder.row}`}
                              style={{
                                gridColumn: placeholder.column,
                                gridRow: placeholder.row,
                              }}
                            />
                          ))
                        : weekEventSegments(week, visibleEvents, days[0]!)
                            .filter((segment) => segment.lane < 3)
                            .map((segment) => (
                              <button
                                className={`school-calendar-event ${eventTone(segment.event)}${
                                  segment.event.isPublic ? '' : ' private'
                                }${segment.isMultiDay ? ' is-multi-day' : ''}${
                                  segment.isInline ? ' is-inline' : ''
                                }${
                                  segment.showLabel ? '' : ' is-continuation'
                                }${segment.continuesBefore ? ' starts-before' : ''}${
                                  segment.continuesAfter ? ' ends-after' : ''
                                }${segment.endColumn === 7 ? ' ends-week' : ''}`}
                                type="button"
                                key={`${segment.event.id}-${week[0]}`}
                                style={{
                                  gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
                                  gridRow: segment.lane + 1,
                                }}
                                onClick={(event) => {
                                  const clickedDate = clickedSegmentDate(
                                    event,
                                    week,
                                    segment.startColumn,
                                    segment.endColumn,
                                  );
                                  setSelectedDate(clickedDate);
                                  if (isMobileCalendar()) {
                                    setSelectedEventId(null);
                                    setMobileDayOpen(true);
                                  } else {
                                    setSelectedEventId(segment.event.id);
                                  }
                                }}
                                onMouseEnter={(event) =>
                                  setPopover({
                                    title: segment.event.title,
                                    period: formatPeriod(segment.event),
                                    tone: eventTone(segment.event),
                                    x: event.clientX,
                                    y: event.clientY,
                                  })
                                }
                                onMouseMove={(event) =>
                                  setPopover((current) =>
                                    current
                                      ? { ...current, x: event.clientX, y: event.clientY }
                                      : current,
                                  )
                                }
                                onMouseLeave={() => setPopover(null)}
                              >
                                {segment.showLabel ? <span>{segment.event.title}</span> : null}
                              </button>
                            ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                  <h2>{formatCalendarDate(selectedDate, false)}</h2>
                  <span>{selectedDateEvents.length}건</span>
                </div>
              </div>
              {calendarQuery.isLoading ? (
                <div className="selected-day-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : selectedDateEvents.length ? (
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
                <EmptyState compact title="등록된 일정이 없습니다." />
              )}
            </section>
          </aside>
        </div>
      </section>

      <Dialog
        className="school-calendar-mobile-day-dialog"
        open={mobileDayOpen}
        onClose={() => setMobileDayOpen(false)}
        title={formatCalendarDate(selectedDate, false)}
      >
        {selectedDateEvents.length ? (
          <div className="school-calendar-mobile-day-list">
            {selectedDateEvents.map((event) => (
              <article key={event.id} className={eventTone(event)}>
                <i className={`source-dot ${eventTone(event)}`} aria-hidden="true" />
                <div>
                  <strong>{event.title}</strong>
                  <span>{formatPeriod(event)}</span>
                </div>
                {!event.isPublic ? <em>비공개</em> : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState compact title="등록된 일정이 없습니다." />
        )}
      </Dialog>

      <Drawer
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEventId(null)}
        title={selectedEvent?.title ?? '일정 상세'}
        description={
          selectedEvent
            ? `${eventCategoryLabel(selectedEvent)} · ${
                selectedEvent.editable ? '관리 일정' : '읽기 전용'
              }`
            : undefined
        }
        footer={
          selectedEvent?.editable && selectedEvent.managedId ? (
            <RowActions className="button-row" mobileTitle={selectedEvent.title}>
              <RowActionButton
                icon={<Pencil aria-hidden="true" />}
                label={`${selectedEvent.title} 수정`}
                onClick={() => openEdit(selectedEvent)}
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
              <dd>{selectedEvent.editable ? '관리 일정' : '읽기 전용'}</dd>
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
        className="school-event-editor-dialog"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId === null ? '새 일정' : '일정 수정'}
        size="lg"
        footer={
          <DialogActions
            onClose={() => setEditorOpen(false)}
            confirmLabel="저장"
            confirmType="submit"
            confirmDisabled={saveMutation.isPending}
          />
        }
      >
        <form className="calendar-event-form" id="school-event-form" onSubmit={submit}>
          <div className="calendar-event-identity full">
            <div className="calendar-event-field">
              <span>분류</span>
              <CalendarCategorySelect
                value={form.category}
                onChange={(category) => setForm((current) => ({ ...current, category }))}
              />
            </div>
            <label>
              <span>제목</span>
              <input
                autoFocus
                value={form.title}
                maxLength={160}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="일정 제목을 입력하세요"
                required
              />
            </label>
          </div>
          <fieldset className="calendar-event-datetime full">
            <div className="calendar-event-datetime__heading">
              <legend>일시</legend>
              <label className="checkbox-row compact-check">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(event) => changeAllDay(event.target.checked)}
                />
                <span>종일</span>
              </label>
            </div>
            <div className="calendar-event-datetime__range">
              <label>
                <span className="sr-only">시작{form.allDay ? '일' : ' 시각'}</span>
                <input
                  aria-label={`시작${form.allDay ? '일' : ' 시각'}`}
                  type={form.allDay ? 'date' : 'datetime-local'}
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                  required
                />
              </label>
              <span className="calendar-event-datetime__separator" aria-hidden="true">
                ~
              </span>
              <label>
                <span className="sr-only">종료{form.allDay ? '일' : ' 시각'}</span>
                <input
                  aria-label={`종료${form.allDay ? '일' : ' 시각'}`}
                  type={form.allDay ? 'date' : 'datetime-local'}
                  value={form.endsAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endsAt: event.target.value }))
                  }
                  required
                />
              </label>
            </div>
          </fieldset>
          <label className="full">
            <span>설명</span>
            <input
              value={form.description}
              maxLength={5000}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="설명을 입력하세요"
            />
          </label>
          <div className="calendar-event-options full">
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="일정 삭제"
        subject={deleteTarget?.title}
        description="삭제한 일정은 복구할 수 없습니다."
        pending={deleteMutation.isPending}
        onConfirm={() => deleteTarget?.managedId && deleteMutation.mutate(deleteTarget.managedId)}
      />
      {popover
        ? createPortal(
            <div
              className="school-calendar-event-popover"
              role="tooltip"
              style={{
                left: Math.min(popover.x + 12, window.innerWidth - 300),
                top: Math.min(popover.y + 14, window.innerHeight - 88),
              }}
            >
              <strong>
                <i className={`source-dot ${popover.tone}`} aria-hidden="true" />
                <span>{popover.title}</span>
              </strong>
              <span className={popover.tone === 'holiday' ? 'is-holiday' : undefined}>
                {popover.period}
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

import type { AcademicEvent } from '@jshsus/types';
import {
  CalendarGrid,
  clearSheetSnapStates,
  DialogShell,
  type CalendarGridEvent,
  type CalendarGridPanel,
} from '@jshsus/ui';
import type { CSSProperties, KeyboardEvent, TouchEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueries } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter, toKoreanDateKey } from '../../shared/lib/date';
import { getCalendar } from './api';
import '@jshsus/ui/calendar-grid.css';
import '../../styles/calendar.css';

const maxVisibleEventBars = 3;
type CalendarCell = {
  date: Date;
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
};
type CalendarPageContentProps = {
  initialSelectedDate: string;
};
type CalendarPopover = {
  key: string;
  title: string;
  period: string;
  tone: 'school' | 'observance' | 'holiday';
  x: number;
  y: number;
};
type CalendarSlideDirection = 'previous' | 'next';

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function monthGrid(date: Date): CalendarCell[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - firstDay.getDay());
  const weekCount = Math.max(5, Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7));
  return Array.from({ length: weekCount * 7 }, (_, index) => {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + index);
    return {
      date: cellDate,
      dateKey: toDateKey(cellDate),
      day: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === month,
    };
  });
}

function eventTouchesDate(event: AcademicEvent, dateKey: string) {
  return toKoreanDateKey(event.startsAt) <= dateKey && toKoreanDateKey(event.endsAt) >= dateKey;
}

function eventColor(event: AcademicEvent) {
  if (event.isHoliday) return { color: '#be123c', background: '#ffe4e6' };
  if (event.category === 'observance') return { color: '#0c43b7', background: 'transparent' };
  return { color: '#185b46', background: '#ddf5ea' };
}

function eventTone(event: AcademicEvent): CalendarPopover['tone'] {
  if (event.isHoliday || event.category === 'holiday') return 'holiday';
  return event.category === 'observance' ? 'observance' : 'school';
}

function eventRange(event: AcademicEvent) {
  return {
    startsAt: toKoreanDateKey(event.startsAt),
    endsAt: toKoreanDateKey(event.endsAt),
  };
}

function toCalendarGridEvent(event: AcademicEvent): CalendarGridEvent {
  const range = eventRange(event);
  return {
    id: event.id,
    title: displayEventTitle(event.title),
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    category: event.category,
    isHoliday: event.isHoliday,
  };
}

function styleForEvent(event: AcademicEvent) {
  const { color, background } = eventColor(event);
  return {
    '--event-bg': background,
    '--event-color': color,
  } as CSSProperties;
}

function displayEventTitle(title: string) {
  return title
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/^\s*·\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function eventMergeKey(event: AcademicEvent) {
  return [
    displayEventTitle(event.title),
    event.isHoliday ? 'holiday' : 'school',
    event.category,
    event.source,
    event.description ?? '',
  ].join('\u001f');
}

function CalendarAgendaContent({
  events,
  isLoading,
}: {
  events: AcademicEvent[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="calendar-agenda__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="calendar-agenda__empty">등록된 일정이 없습니다.</p>;
  }

  return (
    <div className="calendar-agenda__list">
      {events.map((event) => (
        <article key={event.id} style={styleForEvent(event)}>
          <i
            className={`calendar-source-dot is-${
              event.isHoliday || event.category === 'holiday'
                ? 'holiday'
                : event.category === 'observance'
                  ? 'observance'
                  : 'school'
            }`}
            aria-hidden="true"
          />
          <div>
            <h4>{displayEventTitle(event.title)}</h4>
            <span className="calendar-agenda__meta">{formatEventRange(event)}</span>
            {event.description ? <p>{event.description}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function nextDateKey(dateKey: string) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

function mergeAdjacentEvents(sourceEvents: AcademicEvent[]) {
  const groups = new Map<string, AcademicEvent[]>();
  for (const event of sourceEvents) {
    const key = eventMergeKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const mergedEvents: AcademicEvent[] = [];

  for (const group of groups.values()) {
    const sortedGroup = [...group].sort((left, right) => {
      const leftRange = eventRange(left);
      const rightRange = eventRange(right);
      return (
        leftRange.startsAt.localeCompare(rightRange.startsAt) ||
        leftRange.endsAt.localeCompare(rightRange.endsAt)
      );
    });

    for (const event of sortedGroup) {
      const range = eventRange(event);
      const lastEvent = mergedEvents[mergedEvents.length - 1];
      if (lastEvent && eventMergeKey(lastEvent) === eventMergeKey(event)) {
        const lastRange = eventRange(lastEvent);
        if (range.startsAt <= nextDateKey(lastRange.endsAt)) {
          const endsAt = lastRange.endsAt >= range.endsAt ? lastEvent.endsAt : event.endsAt;
          mergedEvents[mergedEvents.length - 1] = {
            ...lastEvent,
            endsAt,
            id: `${lastEvent.id}__${event.id}`,
          };
          continue;
        }
      }
      mergedEvents.push({ ...event });
    }
  }

  return mergedEvents.sort((left, right) => {
    const leftRange = eventRange(left);
    const rightRange = eventRange(right);
    return (
      leftRange.startsAt.localeCompare(rightRange.startsAt) ||
      leftRange.endsAt.localeCompare(rightRange.endsAt) ||
      left.title.localeCompare(right.title, 'ko-KR')
    );
  });
}

const ariaDateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const weekdayFormatter = createKoreanDateFormatter({ weekday: 'short' });
const eventTimeFormatter = createKoreanDateFormatter({
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatCalendarDate(dateKey: string, includeYear = true) {
  const [year, month, day] = dateKey.split('-');
  const date = includeYear ? `${year}.${month}.${day}` : `${month}.${day}`;
  return `${date} (${weekdayFormatter.format(fromDateKey(dateKey))})`;
}

export function formatEventRange(
  event: AcademicEvent,
  yearMode: 'cross-year' | 'never' = 'cross-year',
) {
  const startKey = toKoreanDateKey(event.startsAt);
  const endKey = toKoreanDateKey(event.endsAt);
  const crossesYear = startKey.slice(0, 4) !== endKey.slice(0, 4);
  const includeYear = yearMode === 'cross-year' && crossesYear;
  const startLabel = formatCalendarDate(startKey, includeYear);
  const endLabel = formatCalendarDate(endKey, includeYear);
  if (event.allDay) {
    return startKey === endKey ? `${startLabel} 종일` : `${startLabel} 〜 ${endLabel} 종일`;
  }
  const startTime = eventTimeFormatter.format(new Date(event.startsAt));
  const endTime = eventTimeFormatter.format(new Date(event.endsAt));
  return startKey === endKey
    ? `${startLabel} ${startTime} 〜 ${endTime}`
    : `${startLabel} ${startTime} 〜 ${endLabel} ${endTime}`;
}

export function calendarEventInteractionMode(viewportWidth: number) {
  if (viewportWidth <= 767) return 'mobile-agenda' as const;
  if (viewportWidth < 1024) return 'click-popover' as const;
  return 'hover-popover' as const;
}

export function CalendarPage() {
  const search = useSearch({ from: '/calendar' });
  const todayKey = toDateKey(new Date());
  const initialSelectedDate = isDateKey(search.date) ? search.date : todayKey;

  return (
    <CalendarPageContent key={initialSelectedDate} initialSelectedDate={initialSelectedDate} />
  );
}

function CalendarPageContent({ initialSelectedDate }: CalendarPageContentProps) {
  const todayKey = toDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = fromDateKey(initialSelectedDate);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [popover, setPopover] = useState<CalendarPopover | null>(null);
  const [mobileAgendaMounted, setMobileAgendaMounted] = useState(false);
  const [mobileAgendaClosing, setMobileAgendaClosing] = useState(false);
  const mobileAgendaMountedRef = useRef(false);
  const mobileAgendaClosingRef = useRef(false);
  const fullCalendarRef = useRef<HTMLDivElement>(null);
  const pendingVisibleMonthRef = useRef<Date | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [calendarSlide, setCalendarSlide] = useState<CalendarSlideDirection | null>(null);
  const [calendarDragOffset, setCalendarDragOffset] = useState(0);
  const [isCalendarDragging, setIsCalendarDragging] = useState(false);
  const [isCalendarResetting, setIsCalendarResetting] = useState(false);
  const monthPanels = useMemo(
    () =>
      [-1, 0, 1].map((offset) => {
        const month = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
        const cells = monthGrid(month);
        return {
          month,
          cells,
          range: { from: cells[0].dateKey, to: cells[cells.length - 1].dateKey },
        };
      }),
    [visibleMonth],
  );
  const calendarQueries = useQueries({
    queries: monthPanels.map((panel) => ({
      queryKey: ['school-calendar', panel.range.from, panel.range.to],
      queryFn: () => getCalendar(panel.range.from, panel.range.to),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const renderedMonthPanels = monthPanels.map((panel, index) => ({
    ...panel,
    events: mergeAdjacentEvents(calendarQueries[index]?.data?.events ?? []),
    isLoading: calendarQueries[index]?.isLoading ?? false,
  }));
  const allRenderedEvents = renderedMonthPanels.flatMap((panel) => panel.events);
  const calendarGridPanels: CalendarGridPanel[] = renderedMonthPanels.map((panel) => ({
    month: toDateKey(panel.month).slice(0, 7),
    events: panel.events.map(toCalendarGridEvent),
    isLoading: panel.isLoading,
  }));
  const currentMonthPanel = renderedMonthPanels[1]!;
  const calendarQuery = calendarQueries[1]!;
  const events = currentMonthPanel.events;
  const selectedEvents = events.filter((event) => eventTouchesDate(event, selectedDate));
  const selectedDateLabel = formatCalendarDate(selectedDate, false);
  const monthStartKey = toDateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1));
  const monthEndKey = toDateKey(
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0),
  );
  const hasCurrentMonthEvents = events.some((event) => {
    const eventDates = eventRange(event);
    return eventDates.startsAt <= monthEndKey && eventDates.endsAt >= monthStartKey;
  });
  const calendarUnavailable = calendarQuery.isSuccess && !calendarQuery.data.schoolEventsAvailable;
  const emptyCurrentMonth =
    calendarQuery.isSuccess && calendarQuery.data.schoolEventsAvailable && !hasCurrentMonthEvents;
  const calendarMonthLabel =
    visibleMonth.getFullYear() === Number(todayKey.slice(0, 4))
      ? `${visibleMonth.getMonth() + 1}월`
      : `${visibleMonth.getFullYear()}년 ${visibleMonth.getMonth() + 1}월`;

  const completeMonthTransition = useCallback(() => {
    const nextMonth = pendingVisibleMonthRef.current;
    if (!nextMonth) return;
    pendingVisibleMonthRef.current = null;
    setIsCalendarResetting(true);
    setVisibleMonth(nextMonth);
    setCalendarSlide(null);
    setCalendarDragOffset(0);
    setIsCalendarDragging(false);
    window.requestAnimationFrame(() => setIsCalendarResetting(false));
  }, [
    setCalendarDragOffset,
    setCalendarSlide,
    setIsCalendarDragging,
    setIsCalendarResetting,
    setVisibleMonth,
  ]);

  useEffect(() => {
    if (!calendarSlide) return undefined;
    const timer = window.setTimeout(completeMonthTransition, 280);
    return () => window.clearTimeout(timer);
  }, [calendarSlide, completeMonthTransition]);

  const startMonthTransition = (nextMonth: Date, direction: CalendarSlideDirection) => {
    if (calendarSlide) return;
    pendingVisibleMonthRef.current = nextMonth;
    setPopover(null);
    setCalendarDragOffset(0);
    setIsCalendarDragging(false);
    setCalendarSlide(direction);
  };

  const focusDate = (dateKey: string) => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-calendar-date="${dateKey}"]`)?.focus();
    });
  };

  const selectDate = (date: Date, moveFocus = false) => {
    const dateKey = toDateKey(date);
    const monthOffset =
      (date.getFullYear() - visibleMonth.getFullYear()) * 12 +
      date.getMonth() -
      visibleMonth.getMonth();
    if (monthOffset !== 0) {
      const nextMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      if (Math.abs(monthOffset) === 1) {
        startMonthTransition(nextMonth, monthOffset > 0 ? 'next' : 'previous');
      } else {
        setVisibleMonth(nextMonth);
      }
    }
    setSelectedDate(dateKey);
    setPopover(null);
    if (moveFocus) focusDate(dateKey);
  };

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    if (Math.abs(offset) === 1) {
      startMonthTransition(next, offset > 0 ? 'next' : 'previous');
    } else {
      setVisibleMonth(next);
    }
    setSelectedDate(toDateKey(next));
    setPopover(null);
  };

  const openMobileAgenda = () => {
    mobileAgendaMountedRef.current = true;
    mobileAgendaClosingRef.current = false;
    setMobileAgendaClosing(false);
    setMobileAgendaMounted(true);
  };

  const closeMobileAgenda = useCallback(() => {
    if (!mobileAgendaMountedRef.current || mobileAgendaClosingRef.current) return;
    clearSheetSnapStates();
    mobileAgendaClosingRef.current = true;
    setMobileAgendaClosing(true);
  }, [setMobileAgendaClosing]);
  useEffect(() => {
    if (!mobileAgendaClosing) return undefined;
    const timer = window.setTimeout(() => {
      mobileAgendaMountedRef.current = false;
      mobileAgendaClosingRef.current = false;
      setMobileAgendaMounted(false);
      setMobileAgendaClosing(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mobileAgendaClosing]);

  useEffect(() => {
    if (!mobileAgendaMounted) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileAgenda();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeMobileAgenda, mobileAgendaMounted]);

  useEffect(() => {
    if (!popover) return undefined;
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('.full-calendar__event-bar')) {
        setPopover(null);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [popover]);

  const handleCalendarTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (calendarSlide) return;
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    setIsCalendarDragging(Boolean(touch));
    setCalendarDragOffset(0);
  };

  const handleCalendarTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.touches[0];
    if (!start || !touch || calendarSlide) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    // `touch-action: pan-y` on the calendar reserves the horizontal gesture
    // without calling preventDefault from React's passive touch listener.
    const width = fullCalendarRef.current?.clientWidth ?? window.innerWidth;
    const offset = Math.max(-width, Math.min(width, deltaX));
    setCalendarDragOffset(offset);
  };

  const handleCalendarTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) {
      setIsCalendarDragging(false);
      setCalendarDragOffset(0);
      return;
    }
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const width = fullCalendarRef.current?.clientWidth ?? window.innerWidth;
    const threshold = Math.max(44, width * 0.18);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      const offset = deltaX < 0 ? 1 : -1;
      const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
      startMonthTransition(next, offset > 0 ? 'next' : 'previous');
      setSelectedDate(toDateKey(next));
      return;
    }
    setIsCalendarDragging(false);
    setCalendarDragOffset(0);
  };

  const handleDateKeyDown = (event: KeyboardEvent<HTMLButtonElement>, dateKey: string) => {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = fromDateKey(dateKey);
    next.setDate(next.getDate() + offset);
    selectDate(next, true);
  };

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('calendar')}
      title="학사일정"
      width="wide"
      variant="workspace"
    >
      <section className="calendar-workspace" aria-label="학사일정 달력">
        <header className="calendar-toolbar">
          <div className="calendar-toolbar__calendar">
            <div className="calendar-month-control">
              <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <h2 aria-live="polite">{calendarMonthLabel}</h2>
              <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="calendar-toolbar__agenda" aria-live="polite">
            <strong>{selectedDateLabel}</strong>
            <span>{selectedEvents.length}건</span>
          </div>
        </header>

        {emptyCurrentMonth ? (
          <div className="calendar-availability-note" role="status">
            <Info size={16} aria-hidden="true" />
            <span>
              {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월에 등록된 학사일정
              정보가 없습니다.
            </span>
          </div>
        ) : null}
        {calendarUnavailable ? (
          <div className="calendar-availability-note is-warning" role="status">
            <Info size={16} aria-hidden="true" />
            <span>일정 정보를 확인할 수 없어 날짜만 표시하고 있습니다.</span>
          </div>
        ) : null}
        {calendarQuery.isError ? (
          <PageState
            kind="error"
            title="일정을 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
            variant="section"
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => calendarQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}

        {!calendarQuery.isError ? (
          <div className="calendar-layout" aria-busy={calendarQuery.isLoading}>
            <div
              className="full-calendar"
              ref={fullCalendarRef}
              onTouchStart={handleCalendarTouchStart}
              onTouchEnd={handleCalendarTouchEnd}
              onTouchMove={handleCalendarTouchMove}
            >
              <CalendarGrid
                panels={calendarGridPanels}
                selectedDate={selectedDate}
                todayDate={todayKey}
                maxVisibleEventBars={maxVisibleEventBars}
                isDragging={isCalendarDragging}
                isResetting={isCalendarResetting}
                trackTransform={
                  calendarSlide === 'next'
                    ? 'translate3d(-66.6667%, 0, 0)'
                    : calendarSlide === 'previous'
                      ? 'translate3d(0, 0, 0)'
                      : `translate3d(calc(-33.3333% + ${calendarDragOffset}px), 0, 0)`
                }
                formatDateLabel={(dateKey) => ariaDateFormatter.format(fromDateKey(dateKey))}
                onDateSelect={(dateKey, eventCount) => {
                  selectDate(fromDateKey(dateKey));
                  if (window.innerWidth <= 767) {
                    if (eventCount > 0) openMobileAgenda();
                    else closeMobileAgenda();
                  }
                }}
                onDateKeyDown={handleDateKeyDown}
                onEventSelect={({ event, dateKey, segmentKey, clientX, clientY }) => {
                  const originalEvent = allRenderedEvents.find(
                    (candidate) => String(candidate.id) === String(event.id),
                  );
                  if (!originalEvent) return;
                  selectDate(fromDateKey(dateKey));
                  const interactionMode = calendarEventInteractionMode(window.innerWidth);
                  if (interactionMode === 'mobile-agenda') {
                    openMobileAgenda();
                    return;
                  }
                  if (interactionMode !== 'click-popover') return;
                  setPopover((current) =>
                    current?.key === segmentKey
                      ? null
                      : {
                          key: segmentKey,
                          title: displayEventTitle(originalEvent.title),
                          period: formatEventRange(originalEvent, 'never'),
                          tone: eventTone(originalEvent),
                          x: clientX,
                          y: clientY,
                        },
                  );
                }}
                onEventPointerEnter={({ event, segmentKey, clientX, clientY }) => {
                  if (calendarEventInteractionMode(window.innerWidth) !== 'hover-popover') return;
                  const originalEvent = allRenderedEvents.find(
                    (candidate) => String(candidate.id) === String(event.id),
                  );
                  if (!originalEvent) return;
                  setPopover({
                    key: segmentKey,
                    title: displayEventTitle(originalEvent.title),
                    period: formatEventRange(originalEvent, 'never'),
                    tone: eventTone(originalEvent),
                    x: clientX,
                    y: clientY,
                  });
                }}
                onEventPointerMove={({ clientX, clientY }) => {
                  if (calendarEventInteractionMode(window.innerWidth) !== 'hover-popover') return;
                  setPopover((current) =>
                    current ? { ...current, x: clientX, y: clientY } : current,
                  );
                }}
                onEventPointerLeave={() => {
                  if (calendarEventInteractionMode(window.innerWidth) === 'hover-popover') {
                    setPopover(null);
                  }
                }}
              />
            </div>

            <div className="calendar-layout__agenda" aria-live="polite">
              <strong>{selectedDateLabel}</strong>
              <span>{selectedEvents.length}건</span>
            </div>

            <aside className="calendar-agenda" aria-live="polite">
              <CalendarAgendaContent events={selectedEvents} isLoading={calendarQuery.isLoading} />
            </aside>
          </div>
        ) : null}
        {popover
          ? createPortal(
              <div
                className="calendar-event-popover"
                role="tooltip"
                style={{
                  left: Math.min(popover.x + 12, window.innerWidth - 300),
                  top: Math.min(popover.y + 14, window.innerHeight - 88),
                }}
              >
                <strong>
                  <i className={`is-${popover.tone}`} aria-hidden="true" />
                  <span>{popover.title}</span>
                </strong>
                <span className={popover.tone === 'holiday' ? 'is-holiday' : undefined}>
                  {popover.period}
                </span>
              </div>,
              document.body,
            )
          : null}
        {mobileAgendaMounted && selectedEvents.length > 0
          ? createPortal(
              <div
                className={`calendar-mobile-modal${mobileAgendaClosing ? ' is-closing' : ''}`}
                role="presentation"
                onClick={closeMobileAgenda}
              >
                <div
                  className="calendar-mobile-modal__dialog-host"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="calendar-mobile-modal-title"
                  onClick={(event) => event.stopPropagation()}
                >
                  <DialogShell
                    className="calendar-mobile-modal__dialog"
                    headerClassName="calendar-mobile-modal__header"
                    bodyClassName="calendar-mobile-modal__body"
                    footerClassName="calendar-mobile-modal__footer"
                    closeClassName="calendar-mobile-modal__close"
                    showCloseButton={false}
                    title={selectedDateLabel}
                    titleId="calendar-mobile-modal-title"
                    closeLabel="일정 닫기"
                    onClose={closeMobileAgenda}
                  >
                    <CalendarAgendaContent events={selectedEvents} isLoading={false} />
                  </DialogShell>
                </div>
              </div>,
              document.body,
            )
          : null}
      </section>
    </PageScaffold>
  );
}

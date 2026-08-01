import type { AcademicEvent } from '@jshsus/types';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter, toKoreanDateKey } from '../../shared/lib/date';
import { getCalendar } from './api';
import '../../styles/calendar.css';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
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
  title: string;
  period: string;
  tone: 'school' | 'observance' | 'holiday';
  x: number;
  y: number;
};

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

function calendarWeeks(cells: CalendarCell[]) {
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}

function clickedSegmentDate(
  event: MouseEvent<HTMLButtonElement>,
  week: CalendarCell[],
  startColumn: number,
  endColumn: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const length = endColumn - startColumn + 1;
  const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  const offset = Math.min(length - 1, Math.max(0, Math.floor(ratio * length)));
  return week[startColumn - 1 + offset]?.date ?? week[startColumn - 1]!.date;
}

function eventTouchesDate(event: AcademicEvent, dateKey: string) {
  return toKoreanDateKey(event.startsAt) <= dateKey && toKoreanDateKey(event.endsAt) >= dateKey;
}

function eventColor(event: AcademicEvent) {
  if (event.isHoliday) return { color: '#ffffff', background: '#e34242' };
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

function isInlineCalendarEvent(event: AcademicEvent) {
  const range = eventRange(event);
  return range.startsAt === range.endsAt && event.category === 'observance';
}

function styleForEvent(event: AcademicEvent): CSSProperties {
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

function weekEventSegments(week: CalendarCell[], events: AcademicEvent[], gridStartKey: string) {
  const weekStartKey = week[0].dateKey;
  const weekEndKey = week[6].dateKey;
  const lanes: Array<Array<{ end: number; start: number }>> = [];
  const isLaneFree = (lane: number, start: number, end: number) =>
    (lanes[lane] ?? []).every((occupied) => end < occupied.start || start > occupied.end);
  const occupyLane = (lane: number, start: number, end: number) => {
    lanes[lane] = [...(lanes[lane] ?? []), { end, start }];
  };
  return [...events]
    .sort((left, right) => {
      const leftRange = eventRange(left);
      const rightRange = eventRange(right);
      return (
        leftRange.startsAt.localeCompare(rightRange.startsAt) ||
        leftRange.endsAt.localeCompare(rightRange.endsAt) ||
        left.title.localeCompare(right.title, 'ko-KR')
      );
    })
    .flatMap((event) => {
      const range = eventRange(event);
      if (range.startsAt > weekEndKey || range.endsAt < weekStartKey) return [];

      const segmentStartKey = range.startsAt < weekStartKey ? weekStartKey : range.startsAt;
      const segmentEndKey = range.endsAt > weekEndKey ? weekEndKey : range.endsAt;
      const start = week.findIndex((cell) => cell.dateKey === segmentStartKey);
      const end = week.findIndex((cell) => cell.dateKey === segmentEndKey);
      if (start < 0 || end < 0) return [];

      const firstVisibleStartKey = range.startsAt < gridStartKey ? gridStartKey : range.startsAt;
      const showLabel = segmentStartKey === firstVisibleStartKey;
      let lane = 0;
      while (!isLaneFree(lane, start, end)) lane += 1;
      occupyLane(lane, start, end);

      return [
        {
          continuesAfter: range.endsAt > segmentEndKey,
          continuesBefore: range.startsAt < segmentStartKey,
          endColumn: end + 1,
          event,
          isInline: isInlineCalendarEvent(event),
          lane,
          showLabel,
          startColumn: start + 1,
        },
      ];
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

export function formatCalendarDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-');
  return `${year}. ${month}. ${day} (${weekdayFormatter.format(fromDateKey(dateKey))})`;
}

function formatEventRange(event: AcademicEvent) {
  const startKey = toKoreanDateKey(event.startsAt);
  const endKey = toKoreanDateKey(event.endsAt);
  const startLabel = formatCalendarDate(startKey);
  const endLabel = formatCalendarDate(endKey);
  if (event.allDay) {
    return startKey === endKey ? `${startLabel} 종일` : `${startLabel} 〜 ${endLabel} 종일`;
  }
  const startTime = eventTimeFormatter.format(new Date(event.startsAt));
  const endTime = eventTimeFormatter.format(new Date(event.endsAt));
  return startKey === endKey
    ? `${startLabel} ${startTime} 〜 ${endTime}`
    : `${startLabel} ${startTime} 〜 ${endLabel} ${endTime}`;
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
  const cells = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);
  const weeks = useMemo(() => calendarWeeks(cells), [cells]);
  const range = { from: cells[0].dateKey, to: cells[cells.length - 1].dateKey };
  const calendarQuery = useQuery({
    queryKey: ['school-calendar', range.from, range.to],
    queryFn: () => getCalendar(range.from, range.to),
  });
  const allEvents = useMemo(
    () => mergeAdjacentEvents(calendarQuery.data?.events ?? []),
    [calendarQuery.data?.events],
  );
  const events = allEvents;
  const selectedEvents = events.filter((event) => eventTouchesDate(event, selectedDate));
  const selectedDateLabel = formatCalendarDate(selectedDate);
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

  const focusDate = (dateKey: string) => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-calendar-date="${dateKey}"]`)?.focus();
    });
  };

  const selectDate = (date: Date, moveFocus = false) => {
    const dateKey = toDateKey(date);
    if (
      date.getFullYear() !== visibleMonth.getFullYear() ||
      date.getMonth() !== visibleMonth.getMonth()
    ) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    setSelectedDate(dateKey);
    if (moveFocus) focusDate(dateKey);
  };

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(toDateKey(next));
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
              <h2 aria-live="polite">
                {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
              </h2>
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
            <div className="full-calendar" aria-label="월간 학사일정">
              <div className="full-calendar__weekdays" aria-hidden="true">
                {weekdays.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="full-calendar__grid">
                {weeks.map((week) => (
                  <div className="full-calendar__week" key={week[0].dateKey}>
                    <div className="full-calendar__week-days">
                      {week.map((cell) => {
                        const dateKey = cell.dateKey;
                        const date = cell.date;
                        const dayEvents = events.filter((event) =>
                          eventTouchesDate(event, dateKey),
                        );
                        const isHolidayDate = dayEvents.some((event) => event.isHoliday);
                        const hiddenEventCount = Math.max(
                          0,
                          dayEvents.length - maxVisibleEventBars,
                        );
                        const eventSummary = calendarQuery.isLoading
                          ? ', 일정을 불러오는 중'
                          : dayEvents.length
                            ? `, 일정 ${dayEvents.length}개: ${dayEvents
                                .slice(0, 2)
                                .map((event) => displayEventTitle(event.title))
                                .join(', ')}${hiddenEventCount ? ` 외 ${hiddenEventCount}개` : ''}`
                            : ', 일정 없음';
                        return (
                          <button
                            type="button"
                            data-calendar-date={dateKey}
                            className={[
                              dateKey === selectedDate ? 'is-selected' : '',
                              dateKey === todayKey ? 'is-today' : '',
                              isHolidayDate ? 'is-holiday-date' : '',
                              cell.inCurrentMonth ? '' : 'is-outside-month',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => selectDate(date)}
                            onKeyDown={(event) => handleDateKeyDown(event, dateKey)}
                            tabIndex={dateKey === selectedDate ? 0 : -1}
                            aria-label={`${ariaDateFormatter.format(date)}${eventSummary}`}
                            aria-pressed={dateKey === selectedDate}
                            aria-current={dateKey === todayKey ? 'date' : undefined}
                            key={dateKey}
                          >
                            <span className="full-calendar__date">{cell.day}</span>
                            {hiddenEventCount ? (
                              <span className="full-calendar__more">+{hiddenEventCount}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="full-calendar__bars">
                      {calendarQuery.isLoading
                        ? [
                            { column: '1 / 4', row: 1 },
                            { column: '5 / 8', row: 2 },
                          ].map((placeholder) => (
                            <span
                              className="full-calendar__event-skeleton"
                              key={`${week[0].dateKey}-${placeholder.row}`}
                              style={{
                                gridColumn: placeholder.column,
                                gridRow: placeholder.row,
                              }}
                            />
                          ))
                        : weekEventSegments(week, events, cells[0].dateKey)
                            .filter((segment) => segment.lane < maxVisibleEventBars)
                            .map((segment) => (
                              <button
                                type="button"
                                aria-label={displayEventTitle(segment.event.title)}
                                className={`full-calendar__event-bar${
                                  segment.event.isHoliday ? ' is-holiday' : ''
                                }${
                                  segment.isInline ? ' is-inline' : ''
                                }${segment.endColumn > segment.startColumn ? ' is-multi-day' : ''}${
                                  segment.showLabel ? '' : ' is-continuation'
                                }${segment.continuesBefore ? ' starts-before' : ''}${
                                  segment.continuesAfter ? ' ends-after' : ''
                                }${segment.endColumn === 7 ? ' ends-week' : ''}`}
                                key={`${segment.event.id}-${week[0].dateKey}`}
                                style={{
                                  ...styleForEvent(segment.event),
                                  gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
                                  gridRow: segment.lane + 1,
                                }}
                                onClick={(event) =>
                                  selectDate(
                                    clickedSegmentDate(
                                      event,
                                      week,
                                      segment.startColumn,
                                      segment.endColumn,
                                    ),
                                  )
                                }
                                onMouseEnter={(event) =>
                                  setPopover({
                                    title: displayEventTitle(segment.event.title),
                                    period: formatEventRange(segment.event),
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
                                {segment.showLabel ? (
                                  <span>{displayEventTitle(segment.event.title)}</span>
                                ) : null}
                              </button>
                            ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="calendar-agenda" aria-live="polite">
              {calendarQuery.isLoading ? (
                <div className="calendar-agenda__skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : selectedEvents.length === 0 ? (
                <p className="calendar-agenda__empty">등록된 일정이 없습니다.</p>
              ) : (
                <div className="calendar-agenda__list">
                  {selectedEvents.map((event) => (
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
              )}
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
      </section>
    </PageScaffold>
  );
}

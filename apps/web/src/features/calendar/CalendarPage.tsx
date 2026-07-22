import type { AcademicEvent } from '@jshsus/types';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
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

function eventTouchesDate(event: AcademicEvent, dateKey: string) {
  return toKoreanDateKey(event.startsAt) <= dateKey && toKoreanDateKey(event.endsAt) >= dateKey;
}

function eventColor(event: AcademicEvent) {
  if (event.isHoliday) return { color: '#ffffff', background: '#e34242' };
  if (event.category === 'observance') return { color: '#0c43b7', background: 'transparent' };
  return { color: '#000000', background: '#d8f5e6' };
}

function eventRange(event: AcademicEvent) {
  return {
    startsAt: toKoreanDateKey(event.startsAt),
    endsAt: toKoreanDateKey(event.endsAt),
  };
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

function eventTitleNeedsTwoRows(event: AcademicEvent, columnSpan: number, showLabel: boolean) {
  if (!showLabel) return false;
  const title = displayEventTitle(event.title);
  return title.length > Math.max(8, columnSpan * 9);
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
  const isLaneRangeFree = (lane: number, rowSpan: number, start: number, end: number) =>
    Array.from({ length: rowSpan }, (_, offset) => lane + offset).every((targetLane) =>
      (lanes[targetLane] ?? []).every((occupied) => end < occupied.start || start > occupied.end),
    );
  const occupyLaneRange = (lane: number, rowSpan: number, start: number, end: number) => {
    for (let offset = 0; offset < rowSpan; offset += 1) {
      const targetLane = lane + offset;
      lanes[targetLane] = [...(lanes[targetLane] ?? []), { end, start }];
    }
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
      const rowSpan = eventTitleNeedsTwoRows(event, end - start + 1, showLabel) ? 2 : 1;
      let lane = 0;
      while (!isLaneRangeFree(lane, rowSpan, start, end)) lane += 1;
      occupyLaneRange(lane, rowSpan, start, end);

      return [
        {
          continuesAfter: range.endsAt > segmentEndKey,
          continuesBefore: range.startsAt < segmentStartKey,
          endColumn: end + 1,
          event,
          lane,
          rowSpan,
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
const headingDateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const weekdayFormatter = createKoreanDateFormatter({ weekday: 'short' });
const shortDateFormatter = createKoreanDateFormatter({ month: 'numeric', day: 'numeric' });

function formatSelectedDateHeading(date: Date) {
  return `${headingDateFormatter.format(date)} (${weekdayFormatter.format(date)})`;
}

function formatEventRange(event: AcademicEvent) {
  const startsAt = fromDateKey(toKoreanDateKey(event.startsAt));
  const endsAt = fromDateKey(toKoreanDateKey(event.endsAt));
  const startLabel = shortDateFormatter.format(startsAt);
  const endLabel = shortDateFormatter.format(endsAt);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

export function CalendarPage() {
  const todayKey = toDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayKey);
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
            {/* <button
              className="calendar-today-button"
              type="button"
              onClick={() => selectDate(new Date())}
            >
              오늘
            </button> */}
          </div>
        </header>

        {calendarQuery.isLoading ? (
          <PageState kind="loading" title="일정을 불러오는 중입니다." variant="section" />
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

        {calendarQuery.isSuccess ? (
          <div className="calendar-layout">
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
                        const eventSummary = dayEvents.length
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
                    <div className="full-calendar__bars" aria-hidden="true">
                      {weekEventSegments(week, events, cells[0].dateKey)
                        .filter((segment) => segment.lane + segment.rowSpan <= maxVisibleEventBars)
                        .map((segment) => (
                          <span
                            className={`full-calendar__event-bar${
                              segment.event.isHoliday ? ' is-holiday' : ''
                            }${segment.endColumn > segment.startColumn ? ' is-multi-day' : ''}${
                              segment.showLabel ? '' : ' is-continuation'
                            }${segment.continuesBefore ? ' starts-before' : ''}${
                              segment.continuesAfter ? ' ends-after' : ''
                            }${segment.endColumn === 7 ? ' ends-week' : ''}`}
                            key={`${segment.event.id}-${week[0].dateKey}`}
                            style={{
                              ...styleForEvent(segment.event),
                              gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
                              gridRow: `${segment.lane + 1} / span ${segment.rowSpan}`,
                            }}
                            title={displayEventTitle(segment.event.title)}
                          >
                            {segment.showLabel ? displayEventTitle(segment.event.title) : null}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="calendar-agenda" aria-live="polite">
              <div className="calendar-agenda__heading">
                <CalendarDays size={18} aria-hidden="true" />
                <h3>{formatSelectedDateHeading(fromDateKey(selectedDate))}</h3>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="calendar-agenda__empty">등록된 일정이 없습니다.</p>
              ) : (
                <div className="calendar-agenda__list">
                  {selectedEvents.map((event) => (
                    <article key={event.id} style={styleForEvent(event)}>
                      <span className="calendar-agenda__chip" aria-hidden="true" />
                      <div>
                        <span className="calendar-agenda__meta">{formatEventRange(event)}</span>
                        <h4>{displayEventTitle(event.title)}</h4>
                        {event.description ? <p>{event.description}</p> : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </aside>
          </div>
        ) : null}
      </section>
    </PageScaffold>
  );
}

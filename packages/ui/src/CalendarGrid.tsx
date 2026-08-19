import type { CSSProperties, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useMemo } from 'react';

export type CalendarGridEvent = {
  id: string | number;
  title: string;
  startsAt: string;
  endsAt: string;
  category?: 'school' | 'observance' | 'holiday';
  isHoliday?: boolean;
  isPrivate?: boolean;
};

export type CalendarGridPanel = {
  month: string;
  events: readonly CalendarGridEvent[];
  isLoading?: boolean;
};

export type CalendarGridEventPointer = {
  event: CalendarGridEvent;
  segmentKey: string;
  clientX: number;
  clientY: number;
};

export type CalendarGridProps = {
  panels: readonly CalendarGridPanel[];
  selectedDate?: string;
  todayDate?: string;
  maxVisibleEventBars?: number;
  className?: string;
  ariaLabel?: string;
  trackTransform?: string;
  isDragging?: boolean;
  isResetting?: boolean;
  formatDateLabel?: (dateKey: string) => string;
  getEventTitle?: (event: CalendarGridEvent) => string;
  getEventSummary?: (event: CalendarGridEvent) => string;
  onDateSelect?: (dateKey: string, eventCount: number) => void;
  onDateKeyDown?: (event: KeyboardEvent<HTMLButtonElement>, dateKey: string) => void;
  onEventSelect?: (payload: CalendarGridEventPointer & { dateKey: string }) => void;
  onEventPointerEnter?: (payload: CalendarGridEventPointer) => void;
  onEventPointerMove?: (payload: CalendarGridEventPointer) => void;
  onEventPointerLeave?: (payload: CalendarGridEventPointer) => void;
};

type CalendarCell = {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
};

type CalendarSegment = {
  continuesAfter: boolean;
  continuesBefore: boolean;
  endColumn: number;
  event: CalendarGridEvent;
  isInline: boolean;
  lane: number;
  showLabel: boolean;
  startColumn: number;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function shiftDate(dateKey: string, offset: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return shifted.toISOString().slice(0, 10);
}

function monthCells(month: string): CalendarCell[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = `${month}-01`;
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const weekCount = Math.max(5, Math.ceil((weekday + lastDay) / 7));
  const start = shiftDate(first, -weekday);

  return Array.from({ length: weekCount * 7 }, (_, index) => {
    const dateKey = shiftDate(start, index);
    return {
      dateKey,
      day: Number(dateKey.slice(-2)),
      inCurrentMonth: dateKey.startsWith(month),
    };
  });
}

function calendarWeeks(cells: CalendarCell[]) {
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}

function eventRange(event: CalendarGridEvent) {
  return { startsAt: event.startsAt.slice(0, 10), endsAt: event.endsAt.slice(0, 10) };
}

function eventTouchesDate(event: CalendarGridEvent, dateKey: string) {
  const range = eventRange(event);
  return range.startsAt <= dateKey && range.endsAt >= dateKey;
}

function isHoliday(event: CalendarGridEvent) {
  return event.isHoliday || event.category === 'holiday';
}

function isInlineEvent(event: CalendarGridEvent) {
  const range = eventRange(event);
  return range.startsAt === range.endsAt && event.category === 'observance';
}

function eventStyle(event: CalendarGridEvent): CSSProperties {
  if (isHoliday(event)) {
    return {
      '--calendar-event-bg': '#ffe4e6',
      '--calendar-event-color': '#be123c',
    } as CSSProperties;
  }
  if (event.category === 'observance') {
    return {
      '--calendar-event-bg': 'transparent',
      '--calendar-event-color': '#1769aa',
    } as CSSProperties;
  }
  return { '--calendar-event-bg': '#ddf5ea', '--calendar-event-color': '#185b46' } as CSSProperties;
}

function eventSegments(
  week: CalendarCell[],
  events: readonly CalendarGridEvent[],
  gridStartKey: string,
) {
  const weekStartKey = week[0]!.dateKey;
  const weekEndKey = week[6]!.dateKey;
  const lanes: Array<Array<{ end: number; start: number }>> = [];
  const sortedEvents = [...events].sort((left, right) => {
    const leftRange = eventRange(left);
    const rightRange = eventRange(right);
    return (
      leftRange.startsAt.localeCompare(rightRange.startsAt) ||
      leftRange.endsAt.localeCompare(rightRange.endsAt) ||
      left.title.localeCompare(right.title, 'ko-KR')
    );
  });

  return sortedEvents.flatMap<CalendarSegment>((event) => {
    const range = eventRange(event);
    if (range.startsAt > weekEndKey || range.endsAt < weekStartKey) return [];

    const segmentStartKey = range.startsAt < weekStartKey ? weekStartKey : range.startsAt;
    const segmentEndKey = range.endsAt > weekEndKey ? weekEndKey : range.endsAt;
    const start = week.findIndex((cell) => cell.dateKey === segmentStartKey);
    const end = week.findIndex((cell) => cell.dateKey === segmentEndKey);
    if (start < 0 || end < 0) return [];

    let lane = 0;
    while (
      (lanes[lane] ?? []).some((occupied) => !(end < occupied.start || start > occupied.end))
    ) {
      lane += 1;
    }
    lanes[lane] = [...(lanes[lane] ?? []), { end, start }];
    const firstVisibleStartKey = range.startsAt < gridStartKey ? gridStartKey : range.startsAt;

    return [
      {
        continuesAfter: range.endsAt > segmentEndKey,
        continuesBefore: range.startsAt < segmentStartKey,
        endColumn: end + 1,
        event,
        isInline: isInlineEvent(event),
        lane,
        showLabel: segmentStartKey === firstVisibleStartKey,
        startColumn: start + 1,
      },
    ];
  });
}

function clickedSegmentDate(
  event: ReactMouseEvent<HTMLButtonElement>,
  week: CalendarCell[],
  startColumn: number,
  endColumn: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const length = endColumn - startColumn + 1;
  const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  const offset = Math.min(length - 1, Math.max(0, Math.floor(ratio * length)));
  return week[startColumn - 1 + offset]?.dateKey ?? week[startColumn - 1]!.dateKey;
}

function defaultDateLabel(dateKey: string) {
  return dateKey;
}

function defaultEventTitle(event: CalendarGridEvent) {
  return event.title;
}

function defaultEventSummary(event: CalendarGridEvent) {
  return event.title;
}

export function CalendarGrid({
  panels,
  selectedDate,
  todayDate,
  maxVisibleEventBars = 3,
  className,
  ariaLabel = '월간 학사일정',
  trackTransform,
  isDragging = false,
  isResetting = false,
  formatDateLabel = defaultDateLabel,
  getEventTitle = defaultEventTitle,
  getEventSummary = defaultEventSummary,
  onDateSelect,
  onDateKeyDown,
  onEventSelect,
  onEventPointerEnter,
  onEventPointerMove,
  onEventPointerLeave,
}: CalendarGridProps) {
  const normalizedPanels = useMemo(
    () =>
      panels.map((panel) => ({
        ...panel,
        cells: monthCells(panel.month),
      })),
    [panels],
  );
  const isTrack = normalizedPanels.length > 1;
  const trackStyle: CSSProperties = {
    transform: trackTransform,
    width: isTrack ? `${normalizedPanels.length * 100}%` : '100%',
    gridTemplateColumns: `repeat(${normalizedPanels.length}, minmax(0, 1fr))`,
  };

  return (
    <div className={`calendar-grid${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      <div className="calendar-grid__weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-grid__viewport">
        <div
          className={`calendar-grid__track${isDragging ? ' is-dragging' : ''}${
            isResetting ? ' is-resetting' : ''
          }${isTrack ? '' : ' is-single'}`}
          style={trackStyle}
        >
          {normalizedPanels.map((panel) => {
            const weeks = calendarWeeks(panel.cells);
            return (
              <div className="calendar-grid__month-panel" key={panel.month}>
                {weeks.map((week) => (
                  <div className="calendar-grid__week" key={`${panel.month}-${week[0]!.dateKey}`}>
                    <div className="calendar-grid__week-days">
                      {week.map((cell) => {
                        const dayEvents = panel.events.filter((event) =>
                          eventTouchesDate(event, cell.dateKey),
                        );
                        const hiddenEventCount = Math.max(
                          0,
                          dayEvents.length - maxVisibleEventBars,
                        );
                        const isHolidayDate = dayEvents.some(isHoliday);
                        const eventSummary = panel.isLoading
                          ? ', 일정을 불러오는 중'
                          : dayEvents.length
                            ? `, 일정 ${dayEvents.length}개: ${dayEvents
                                .slice(0, 2)
                                .map(getEventSummary)
                                .join(', ')}${hiddenEventCount ? ` 외 ${hiddenEventCount}개` : ''}`
                            : ', 일정 없음';
                        return (
                          <button
                            type="button"
                            className={[
                              cell.dateKey === selectedDate ? 'is-selected' : '',
                              cell.dateKey === todayDate ? 'is-today' : '',
                              isHolidayDate ? 'is-holiday-date' : '',
                              cell.inCurrentMonth ? '' : 'is-outside-month',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            data-calendar-date={cell.dateKey}
                            aria-label={`${formatDateLabel(cell.dateKey)}${eventSummary}`}
                            aria-pressed={cell.dateKey === selectedDate}
                            aria-current={cell.dateKey === todayDate ? 'date' : undefined}
                            tabIndex={cell.dateKey === selectedDate ? 0 : -1}
                            key={cell.dateKey}
                            onClick={() => onDateSelect?.(cell.dateKey, dayEvents.length)}
                            onKeyDown={(event) => onDateKeyDown?.(event, cell.dateKey)}
                          >
                            <span className="calendar-grid__date">{cell.day}</span>
                            {hiddenEventCount ? (
                              <span className="calendar-grid__more">+{hiddenEventCount}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="calendar-grid__bars">
                      {panel.isLoading
                        ? [
                            { column: '1 / 4', row: 1 },
                            { column: '5 / 8', row: 2 },
                          ].map((placeholder) => (
                            <span
                              className="calendar-grid__event-skeleton"
                              key={`${panel.month}-${week[0]!.dateKey}-${placeholder.row}`}
                              style={{
                                gridColumn: placeholder.column,
                                gridRow: placeholder.row,
                              }}
                            />
                          ))
                        : eventSegments(week, panel.events, panel.cells[0]!.dateKey)
                            .filter((segment) => segment.lane < maxVisibleEventBars)
                            .map((segment) => {
                              const segmentIsOutsideMonth = week
                                .slice(segment.startColumn - 1, segment.endColumn)
                                .every((cell) => !cell.inCurrentMonth);
                              const segmentKey = `${segment.event.id}-${week[0]!.dateKey}`;
                              const pointerPayload = (
                                event: ReactMouseEvent<HTMLButtonElement>,
                              ) => ({
                                event: segment.event,
                                segmentKey,
                                clientX: event.clientX,
                                clientY: event.clientY,
                              });
                              return (
                                <button
                                  type="button"
                                  aria-label={getEventTitle(segment.event)}
                                  className={`calendar-grid__event${
                                    isHoliday(segment.event) ? ' is-holiday' : ''
                                  }${
                                    segment.event.category === 'observance' ? ' is-observance' : ''
                                  }${segment.event.isPrivate ? ' is-private' : ''}${
                                    segment.isInline ? ' is-inline' : ''
                                  }${segment.endColumn > segment.startColumn ? ' is-multi-day' : ''}${
                                    segment.showLabel ? '' : ' is-continuation'
                                  }${segment.continuesBefore ? ' starts-before' : ''}${
                                    segment.continuesAfter ? ' ends-after' : ''
                                  }${segment.endColumn === 7 ? ' ends-week' : ''}${
                                    segmentIsOutsideMonth ? ' is-outside-month' : ''
                                  }`}
                                  key={segmentKey}
                                  style={{
                                    ...eventStyle(segment.event),
                                    gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
                                    gridRow: segment.lane + 1,
                                  }}
                                  onClick={(event) =>
                                    onEventSelect?.({
                                      ...pointerPayload(event),
                                      dateKey: clickedSegmentDate(
                                        event,
                                        week,
                                        segment.startColumn,
                                        segment.endColumn,
                                      ),
                                    })
                                  }
                                  onMouseEnter={(event) =>
                                    onEventPointerEnter?.(pointerPayload(event))
                                  }
                                  onMouseMove={(event) =>
                                    onEventPointerMove?.(pointerPayload(event))
                                  }
                                  onMouseLeave={(event) =>
                                    onEventPointerLeave?.(pointerPayload(event))
                                  }
                                >
                                  {segment.showLabel ? (
                                    <span>{getEventTitle(segment.event)}</span>
                                  ) : null}
                                </button>
                              );
                            })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import type { AcademicEvent } from '@jshsus/types';
import type { KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { FilterChips, PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter, toKoreanDateKey } from '../../shared/lib/date';
import { getCalendar } from './api';
import '../../styles/calendar.css';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
type CalendarFilter = 'all' | 'school' | 'holiday';

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

function monthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    from: toDateKey(new Date(year, month, 1)),
    to: toDateKey(new Date(year, month + 1, 0)),
  };
}

function eventTouchesDate(event: AcademicEvent, dateKey: string) {
  return toKoreanDateKey(event.startsAt) <= dateKey && toKoreanDateKey(event.endsAt) >= dateKey;
}

const fullDateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

export function CalendarPage() {
  const todayKey = toDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const range = monthRange(visibleMonth);
  const calendarQuery = useQuery({
    queryKey: ['school-calendar', range.from, range.to],
    queryFn: () => getCalendar(range.from, range.to),
  });
  const allEvents = useMemo(() => calendarQuery.data?.events ?? [], [calendarQuery.data?.events]);
  const events = useMemo(
    () =>
      allEvents.filter((event) => {
        if (filter === 'holiday') return event.isHoliday;
        if (filter === 'school') return !event.isHoliday;
        return true;
      }),
    [allEvents, filter],
  );
  const selectedEvents = events.filter((event) => eventTouchesDate(event, selectedDate));
  const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

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
      description="학교 일정과 공휴일을 월별로 확인하세요."
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
            <button
              className="calendar-today-button"
              type="button"
              onClick={() => selectDate(new Date())}
            >
              오늘
            </button>
          </div>
          <FilterChips
            value={filter}
            onChange={setFilter}
            label="일정 분류"
            options={[
              { value: 'all', label: '전체' },
              { value: 'school', label: '학사' },
              { value: 'holiday', label: '휴일' },
            ]}
          />
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
                {cells.map((day, index) => {
                  if (day === null) {
                    return (
                      <span
                        className="full-calendar__blank"
                        aria-hidden="true"
                        key={`blank-${index}`}
                      />
                    );
                  }
                  const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
                  const dateKey = toDateKey(date);
                  const dayEvents = events.filter((event) => eventTouchesDate(event, dateKey));
                  const hiddenEventCount = Math.max(0, dayEvents.length - 2);
                  const eventSummary = dayEvents.length
                    ? `, 일정 ${dayEvents.length}개: ${dayEvents
                        .slice(0, 2)
                        .map((event) => event.title)
                        .join(', ')}${hiddenEventCount ? ` 외 ${hiddenEventCount}개` : ''}`
                    : ', 일정 없음';
                  return (
                    <button
                      type="button"
                      data-calendar-date={dateKey}
                      className={`${dateKey === selectedDate ? 'is-selected ' : ''}${dateKey === todayKey ? 'is-today' : ''}`.trim()}
                      onClick={() => selectDate(date)}
                      onKeyDown={(event) => handleDateKeyDown(event, dateKey)}
                      tabIndex={dateKey === selectedDate ? 0 : -1}
                      aria-label={`${fullDateFormatter.format(date)}${eventSummary}`}
                      aria-pressed={dateKey === selectedDate}
                      aria-current={dateKey === todayKey ? 'date' : undefined}
                      key={dateKey}
                    >
                      <span className="full-calendar__date">{day}</span>
                      <span
                        className="full-calendar__events"
                        data-count={dayEvents.length}
                        aria-hidden="true"
                      >
                        {dayEvents.slice(0, 2).map((event) => (
                          <span
                            className={event.isHoliday ? 'is-holiday' : undefined}
                            key={event.id}
                          >
                            {event.title}
                          </span>
                        ))}
                        {hiddenEventCount ? <small>+{hiddenEventCount}</small> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="calendar-agenda" aria-live="polite">
              <div className="calendar-agenda__heading">
                <CalendarDays size={18} aria-hidden="true" />
                <div>
                  <span>선택한 날짜</span>
                  <h3>{fullDateFormatter.format(fromDateKey(selectedDate))}</h3>
                </div>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="calendar-agenda__empty">등록된 일정이 없습니다.</p>
              ) : (
                <div className="calendar-agenda__list">
                  {selectedEvents.map((event) => (
                    <article key={event.id}>
                      {event.isHoliday ? <span className="is-holiday">휴일</span> : null}
                      <h4>{event.title}</h4>
                      {event.description ? <p>{event.description}</p> : null}
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

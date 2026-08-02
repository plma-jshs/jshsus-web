import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MoonStar, Sunrise, Sun, Users } from 'lucide-react';
import type {
  AcademicEvent,
  SchoolDataAvailability,
  SchoolDataSourceAvailability,
  SchoolMeal,
  SchoolMealType,
} from '@jshsus/types';
import { ContentBadges } from '../../components/page/ContentBadges';
import { PageState } from '../../components/page/PageScaffold';
import { compactKoreanDateDots, toKoreanDateKey } from '../../shared/lib/date';
import { getHomeDashboard, getSchoolCalendar, getSchoolMeals } from './api';
import {
  canShowConfirmedEmptyState,
  resolveCalendarCardState,
  resolveMealCardState,
} from './data-state';
import { buildCalendarDays } from './calendar-grid';

const KOREA_TIME_ZONE = 'Asia/Seoul';

const mealIcons: Record<SchoolMealType, typeof Sun> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: MoonStar,
  other: Sun,
};

const mealLabels: Record<'breakfast' | 'lunch' | 'dinner', string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

const petitionStatus: Record<string, { label: string; tone: string }> = {
  open: { label: '진행 중', tone: 'positive' },
  awaiting_answer: { label: '답변 대기', tone: 'warning' },
  answered: { label: '답변 완료', tone: 'info' },
  expired: { label: '종료', tone: 'neutral' },
  hidden: { label: '비공개', tone: 'neutral' },
};

function getKoreaDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    key: `${values.year}-${values.month}-${values.day}`,
  };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDateKey(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount));
  return shifted.toISOString().slice(0, 10);
}

function shiftMonth(year: number, month: number, amount: number) {
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

function monthRange(year: number, month: number) {
  return {
    from: dateKey(year, month, 1),
    to: dateKey(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()),
  };
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return compactKoreanDateDots(
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: KOREA_TIME_ZONE,
      month: '2-digit',
      day: '2-digit',
      ...options,
    })
      .format(new Date(value))
      .replace(/\.$/, ''),
  );
}

function formatDashboardDate(value: string) {
  return compactKoreanDateDots(
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: KOREA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
      .format(new Date(`${value}T12:00:00+09:00`))
      .replace(/\.(?=\s*(?:\(|$))/g, ''),
  );
}

function formatCalendarPopoverDate(year: number, month: number, day: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${dateKey(year, month, day)}T12:00:00+09:00`));
}

function formatUpcomingDate(value: string) {
  return compactKoreanDateDots(
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: KOREA_TIME_ZONE,
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
      .format(new Date(value))
      .replace(/\.(?=\s*(?:\(|$))/g, ''),
  );
}

function calendarEventTone(event: AcademicEvent) {
  if (event.isHoliday || event.category === 'holiday') return 'holiday';
  return event.category === 'observance' ? 'observance' : 'school';
}

const majorEventKeywords = [
  '시험',
  '개학',
  '방학',
  '졸업',
  '입학',
  '수강',
  '학교 행사',
  '체육',
  '축제',
  '발표',
  '대회',
  '캠프',
  '설명회',
  '휴업',
  '공휴일',
  '재량',
];

function isMajorAcademicEvent(event: AcademicEvent) {
  return (
    event.isHoliday ||
    event.category === 'holiday' ||
    event.category === 'observance' ||
    majorEventKeywords.some((keyword) => event.title.includes(keyword))
  );
}

function MealColumn({
  type,
  meal,
  loading,
  showEmpty,
}: {
  type: 'breakfast' | 'lunch' | 'dinner';
  meal?: SchoolMeal;
  loading: boolean;
  showEmpty: boolean;
}) {
  const Icon = mealIcons[type];

  return (
    <div className="meal-column">
      <Icon aria-hidden="true" size={28} />
      <strong>{mealLabels[type]}</strong>
      {loading ? (
        <span className="meal-column__empty">불러오는 중…</span>
      ) : meal ? (
        <ul>
          {meal.dishes.map((dish) => (
            <li key={dish}>{dish}</li>
          ))}
        </ul>
      ) : showEmpty ? (
        <span className="meal-column__empty">등록된 식단이 없습니다.</span>
      ) : null}
      {meal?.calories ? <small className="meal-column__calories">{meal.calories}</small> : null}
    </div>
  );
}

function MealCard({
  initialDate,
  initialMeals,
  initialAvailability,
  onRetryInitial,
}: {
  initialDate: string;
  initialMeals: SchoolMeal[];
  initialAvailability: SchoolDataSourceAvailability;
  onRetryInitial: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const usesInitialData = selectedDate === initialDate;
  const mealsQuery = useQuery({
    queryKey: ['school-meals', selectedDate],
    queryFn: () => getSchoolMeals(selectedDate),
    enabled: !usesInitialData,
    staleTime: 10 * 60 * 1000,
  });
  const meals = useMemo(
    () => (usesInitialData ? initialMeals : (mealsQuery.data?.meals ?? [])),
    [initialMeals, mealsQuery.data?.meals, usesInitialData],
  );
  const mealsByType = useMemo(() => new Map(meals.map((meal) => [meal.type, meal])), [meals]);
  const cardState = resolveMealCardState({
    loading: !usesInitialData && mealsQuery.isPending,
    failed: !usesInitialData && mealsQuery.isError,
    availability: usesInitialData
      ? initialAvailability
      : mealsQuery.data
        ? mealsQuery.data.available
          ? 'available'
          : 'unavailable'
        : undefined,
  });
  const hasDataError = cardState === 'error' || cardState === 'unavailable';
  const showEmpty = canShowConfirmedEmptyState(cardState);
  const retry = () => {
    if (usesInitialData) onRetryInitial();
    else void mealsQuery.refetch();
  };

  return (
    <section
      className={`home-card meals-card${hasDataError ? ' has-data-error' : ''}`}
      aria-busy={cardState === 'loading' || mealsQuery.isFetching}
    >
      <header className="home-card__header meal-card__header">
        <h2>식단</h2>
        <div className="meal-date-control">
          <button
            type="button"
            aria-label="이전 날짜 식단"
            onClick={() => setSelectedDate((current) => shiftDateKey(current, -1))}
          >
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <span className="home-card__meta">{formatDashboardDate(selectedDate)}</span>
          <button
            type="button"
            aria-label="다음 날짜 식단"
            onClick={() => setSelectedDate((current) => shiftDateKey(current, 1))}
          >
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      </header>
      {hasDataError ? (
        <div className="home-inline-error" role="alert">
          <span>선택한 날짜의 식단 정보를 확인할 수 없습니다.</span>
          <button type="button" onClick={retry}>
            다시 시도
          </button>
        </div>
      ) : null}
      <div className="meal-grid">
        <MealColumn
          type="breakfast"
          meal={mealsByType.get('breakfast')}
          loading={cardState === 'loading'}
          showEmpty={showEmpty}
        />
        <MealColumn
          type="lunch"
          meal={mealsByType.get('lunch')}
          loading={cardState === 'loading'}
          showEmpty={showEmpty}
        />
        <MealColumn
          type="dinner"
          meal={mealsByType.get('dinner')}
          loading={cardState === 'loading'}
          showEmpty={showEmpty}
        />
      </div>
    </section>
  );
}

function CalendarDay({
  year,
  month,
  day,
  events,
  today,
  isCurrentMonth,
}: {
  year: number;
  month: number;
  day: number;
  events: AcademicEvent[];
  today: ReturnType<typeof getKoreaDateParts>;
  isCurrentMonth: boolean;
}) {
  const isToday = year === today.year && month === today.month && day === today.day;
  const hasHoliday = events.some((event) => event.isHoliday || event.category === 'holiday');
  const className = `mini-calendar__day${isCurrentMonth ? '' : ' is-outside-month'}${isToday ? ' is-today' : ''}${hasHoliday ? ' is-holiday' : ''}${events.length ? ' has-events' : ''}`;
  const tooltipId = `calendar-events-${year}-${month}-${day}`;
  const selectedDate = dateKey(year, month, day);

  if (!events.length) {
    return (
      <Link
        className={className}
        to="/calendar"
        search={{ date: selectedDate }}
        aria-current={isToday ? 'date' : undefined}
      >
        <span className="mini-calendar__date-number">{day}</span>
      </Link>
    );
  }

  return (
    <Link
      role="group"
      className={className}
      to="/calendar"
      search={{ date: selectedDate }}
      aria-current={isToday ? 'date' : undefined}
      aria-describedby={tooltipId}
      aria-label={`${year}년 ${month}월 ${day}일, 일정 ${events.length}개`}
    >
      <span className="mini-calendar__date-number">{day}</span>
      <span className="calendar-event-dots" aria-hidden="true">
        <i />
      </span>
      <span className="calendar-day-popover" id={tooltipId} role="tooltip">
        <strong className={hasHoliday ? 'is-holiday' : undefined}>
          {formatCalendarPopoverDate(year, month, day)}
        </strong>
        {events.slice(0, 3).map((event) => (
          <span className="calendar-day-popover__event" key={event.id}>
            <i className={`is-${calendarEventTone(event)}`} aria-hidden="true" />
            <span>{event.title}</span>
          </span>
        ))}
        {events.length > 3 ? <small>외 {events.length - 3}개 일정</small> : null}
      </span>
    </Link>
  );
}

function CalendarCard({
  initialEvents,
  initialFrom,
  initialTo,
  initialAvailability,
  onRetryInitial,
}: {
  initialEvents: AcademicEvent[];
  initialFrom: string;
  initialTo: string;
  initialAvailability: SchoolDataAvailability;
  onRetryInitial: () => void;
}) {
  const [initialYear, initialMonth] = initialFrom.split('-').map(Number);
  const [visibleMonth, setVisibleMonth] = useState({ year: initialYear, month: initialMonth });
  const range = monthRange(visibleMonth.year, visibleMonth.month);
  const usesInitialData = range.from === initialFrom && range.to === initialTo;
  const calendarQuery = useQuery({
    queryKey: ['school-calendar', range.from, range.to],
    queryFn: () => getSchoolCalendar(range.from, range.to),
    enabled: !usesInitialData,
    staleTime: 10 * 60 * 1000,
  });
  const events = useMemo(
    () => (usesInitialData ? initialEvents : (calendarQuery.data?.events ?? [])),
    [calendarQuery.data?.events, initialEvents, usesInitialData],
  );
  const cardState = resolveCalendarCardState({
    loading: !usesInitialData && calendarQuery.isPending,
    failed: !usesInitialData && calendarQuery.isError,
    availability: usesInitialData ? initialAvailability : calendarQuery.data?.availability,
  });
  const hasDataError = cardState === 'error' || cardState === 'unavailable';
  const retry = () => {
    if (usesInitialData) onRetryInitial();
    else void calendarQuery.refetch();
  };
  const today = getKoreaDateParts();
  const upcomingTo = shiftDateKey(today.key, 6);
  const upcomingQuery = useQuery({
    queryKey: ['school-calendar', 'home-upcoming', today.key, upcomingTo],
    queryFn: () => getSchoolCalendar(today.key, upcomingTo),
    staleTime: 10 * 60 * 1000,
  });
  const days = buildCalendarDays(visibleMonth.year, visibleMonth.month);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, AcademicEvent[]>();
    for (const day of days) {
      const key = day.key;
      const matches = events.filter(
        (event) => toKoreanDateKey(event.startsAt) <= key && toKoreanDateKey(event.endsAt) >= key,
      );
      if (matches.length) map.set(key, matches);
    }
    return map;
  }, [days, events]);

  const upcoming = useMemo(() => {
    const upcomingEvents = upcomingQuery.data?.events ?? [];
    return upcomingEvents
      .filter(
        (event) =>
          toKoreanDateKey(event.startsAt) <= upcomingTo &&
          toKoreanDateKey(event.endsAt) >= today.key &&
          isMajorAcademicEvent(event),
      )
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }, [today.key, upcomingQuery.data?.events, upcomingTo]);
  const visibleUpcoming = upcoming.slice(0, 2);

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => shiftMonth(current.year, current.month, amount));
  };

  return (
    <section
      className={`home-card schedule-card${hasDataError ? ' has-data-error' : ''}`}
      id="academic-schedule"
      aria-busy={cardState === 'loading' || calendarQuery.isFetching}
    >
      <header className="home-card__header schedule-card__header">
        <h2>학사일정</h2>
        <div className="calendar-heading">
          <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <span className="home-card__meta">
            {visibleMonth.year}년 {visibleMonth.month}월
          </span>
          <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      </header>

      {hasDataError ? (
        <div className="home-inline-error" role="alert">
          <span>선택한 달의 일정 정보를 확인할 수 없습니다.</span>
          <button type="button" onClick={retry}>
            다시 시도
          </button>
        </div>
      ) : null}

      <div
        className={`mini-calendar${cardState === 'loading' ? ' is-loading' : ''}`}
        aria-label={`${visibleMonth.year}년 ${visibleMonth.month}월 달력`}
      >
        {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => (
          <span className="mini-calendar__weekday" key={weekday}>
            {weekday}
          </span>
        ))}
        {days.map((day) => (
          <CalendarDay
            key={day.key}
            year={day.year}
            month={day.month}
            day={day.day}
            events={eventsByDay.get(day.key) ?? []}
            today={today}
            isCurrentMonth={day.isCurrentMonth}
          />
        ))}
      </div>

      <div className="upcoming-events">
        <div className="upcoming-events__heading">
          <strong>다가오는 주요 일정</strong>
        </div>
        <ul aria-label="오늘부터 일주일 이내 주요 일정">
          {visibleUpcoming.map((event) => (
            <li key={event.id}>
              <time dateTime={event.startsAt}>{formatUpcomingDate(event.startsAt)}</time>
              <span className="upcoming-events__title">
                <i className={`is-${calendarEventTone(event)}`} aria-hidden="true" />
                <span>{event.title}</span>
              </span>
            </li>
          ))}
          {!upcoming.length && upcomingQuery.isSuccess ? (
            <li className="upcoming-events__empty">예정된 주요 일정이 없습니다.</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const dashboardQuery = useQuery({ queryKey: ['home-dashboard'], queryFn: getHomeDashboard });

  if (dashboardQuery.isLoading) {
    return (
      <div className="home-dashboard" aria-label="홈 화면을 불러오는 중" aria-busy="true">
        <h1 className="sr-only">과구리 학생 정보포털</h1>
        <div className="home-skeleton home-skeleton--banner" />
        <div className="home-skeleton-grid">
          <div className="home-skeleton" />
          <div className="home-skeleton" />
          <div className="home-skeleton" />
        </div>
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <section className="state-message state-message--error" role="alert">
        <h1 className="sr-only">과구리 학생 정보포털</h1>
        <strong>홈 정보를 불러오지 못했습니다.</strong>
        <p>잠시 후 페이지를 새로고침해 주세요.</p>
        <button type="button" onClick={() => dashboardQuery.refetch()}>
          다시 시도
        </button>
      </section>
    );
  }

  const dashboard = dashboardQuery.data;

  return (
    <div className="home-dashboard">
      <h1 className="sr-only">과구리 학생 정보포털</h1>

      <div className="home-primary-grid">
        <section className="home-card notices-card">
          <header className="home-card__header">
            <h2>공지사항</h2>
            <Link to="/notices">
              더보기 <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </header>
          {dashboard.notices.length ? (
            <ul className="notice-preview-list">
              {dashboard.notices.slice(0, 6).map((notice) => {
                const content = (
                  <>
                    <span className="notice-preview-copy">
                      <span className="notice-preview-title">
                        <strong>{notice.title}</strong>
                        <ContentBadges pinned={notice.pinned} createdAt={notice.publishedAt} />
                      </span>
                      <span className="notice-preview-author">[{notice.department}]</span>
                    </span>
                    <time dateTime={notice.publishedAt}>{formatDate(notice.publishedAt)}</time>
                  </>
                );
                return (
                  <li className={notice.pinned ? 'is-pinned' : undefined} key={notice.id}>
                    <Link to="/notices/$noticeId" params={{ noticeId: String(notice.id) }}>
                      {content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PageState kind="empty" variant="section" title="등록된 공지사항이 없습니다." />
          )}
        </section>

        <MealCard
          initialDate={dashboard.schoolData.mealDate}
          initialMeals={dashboard.meals}
          initialAvailability={dashboard.schoolData.mealAvailability}
          onRetryInitial={() => void dashboardQuery.refetch()}
        />

        <CalendarCard
          initialEvents={dashboard.academicEvents}
          initialFrom={dashboard.schoolData.scheduleFrom}
          initialTo={dashboard.schoolData.scheduleTo}
          initialAvailability={dashboard.schoolData.calendarAvailability}
          onRetryInitial={() => void dashboardQuery.refetch()}
        />
      </div>

      <div className="home-community-grid">
        <section className="home-card community-card">
          <header className="home-card__header">
            <h2>자유게시판</h2>
            <Link to="/boards/free">
              더보기 <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </header>
          {dashboard.boardPosts.length ? (
            <ul className="community-preview-list">
              {dashboard.boardPosts.slice(0, 6).map((post) => {
                const content = (
                  <>
                    <span className="content-title-line">
                      <span className="content-title-line__text">{post.title}</span>
                      {post.commentCount > 0 ? (
                        <small className="community-comments">[{post.commentCount}]</small>
                      ) : null}
                      <ContentBadges createdAt={post.createdAt} />
                    </span>
                  </>
                );
                return (
                  <li key={post.id}>
                    <Link to="/boards/free/$postId" params={{ postId: String(post.id) }}>
                      {content}
                    </Link>
                    <span>{post.authorName ?? '익명'}</span>
                    <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PageState kind="empty" variant="section" title="등록된 자유게시판 글이 없습니다." />
          )}
        </section>

        <section className="home-card petitions-card">
          <header className="home-card__header">
            <h2>청원·제안</h2>
            <Link to="/petitions">
              더보기 <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </header>
          {dashboard.petitions.length ? (
            <ul className="petition-preview-list">
              {dashboard.petitions.slice(0, 3).map((petition) => {
                const status = petitionStatus[petition.status] ?? petitionStatus.expired;
                const content = (
                  <>
                    <span className="content-title-line petition-preview-title">
                      <strong className="content-title-line__text">{petition.title}</strong>
                      <ContentBadges createdAt={petition.startsAt} />
                    </span>
                    <span>
                      <Users aria-hidden="true" size={14} /> 참여 {petition.participantCount}명 ·
                      목표 {petition.threshold}명
                    </span>
                  </>
                );
                return (
                  <li key={petition.id}>
                    <span className={`home-badge home-badge--${status.tone}`}>{status.label}</span>
                    <Link to="/petitions/$petitionId" params={{ petitionId: String(petition.id) }}>
                      {content}
                    </Link>
                    <time dateTime={petition.endsAt}>{formatDate(petition.endsAt)}</time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PageState kind="empty" variant="section" title="진행 중인 청원이 없습니다." />
          )}
        </section>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MoonStar,
  Sunrise,
  Sun,
  Users,
} from 'lucide-react';
import type {
  AcademicEvent,
  BoardPostSummary,
  DashboardNotice,
  DashboardPetition,
  HomeDashboard,
  SchoolMeal,
  SchoolMealType,
} from '@jshsus/types';
import { getHomeDashboard, getSchoolCalendar, getSchoolMeals } from '../../lib/api';

const KOREA_TIME_ZONE = 'Asia/Seoul';
const DAY_MS = 86_400_000;

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

function toKoreaDateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(value))
    .replace(/\.$/, '');
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
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    ...options,
  })
    .format(new Date(value))
    .replace(/\.$/, '');
}

function formatDashboardDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
    .format(new Date(`${value}T12:00:00+09:00`))
    .replace(/\.(?=\s*(?:\(|$))/g, '');
}

function buildCalendarDays(year: number, month: number) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return [
    ...Array.from<null>({ length: firstWeekday }).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

function previewIso(dayOffset: number, hour = 9) {
  const date = new Date(Date.now() + dayOffset * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function withHomePreviewData(dashboard: HomeDashboard): HomeDashboard {
  const notices: DashboardNotice[] = [
    {
      id: -101,
      title: '과구리 서비스 개편 안내',
      department: 'IT부',
      pinned: true,
      publishedAt: previewIso(-1),
    },
    {
      id: -102,
      title: '학생회 공지사항 이용 방법',
      department: '학생회',
      pinned: false,
      publishedAt: previewIso(-2),
    },
    {
      id: -103,
      title: '교내 행사 및 일정 확인 안내',
      department: '일반',
      pinned: false,
      publishedAt: previewIso(-4),
    },
    {
      id: -104,
      title: '분실물 게시판 이용 안내',
      department: '생활',
      pinned: false,
      publishedAt: previewIso(-6),
    },
  ];
  const boardPosts: BoardPostSummary[] = [
    {
      id: -201,
      boardSlug: 'free',
      title: '새 과구리에서 가장 자주 쓰는 메뉴가 뭔가요?',
      content: '홈 미리보기용 게시글입니다.',
      authorName: '과구리',
      isAnonymous: false,
      isHidden: false,
      viewCount: 31,
      commentCount: 5,
      createdAt: previewIso(0),
    },
    {
      id: -202,
      boardSlug: 'free',
      title: '시험 기간 공부 장소 추천해주세요',
      content: '홈 미리보기용 게시글입니다.',
      isAnonymous: true,
      isHidden: false,
      viewCount: 52,
      commentCount: 8,
      createdAt: previewIso(-1),
    },
    {
      id: -203,
      boardSlug: 'free',
      title: '오늘 급식 메뉴 확인하고 가세요',
      content: '홈 미리보기용 게시글입니다.',
      authorName: '학생회',
      isAnonymous: false,
      isHidden: false,
      viewCount: 24,
      commentCount: 3,
      createdAt: previewIso(-1),
    },
    {
      id: -204,
      boardSlug: 'free',
      title: '동아리 활동 사진 공유합니다',
      content: '홈 미리보기용 게시글입니다.',
      authorName: '익명',
      isAnonymous: true,
      isHidden: false,
      viewCount: 17,
      commentCount: 2,
      createdAt: previewIso(-2),
    },
  ];
  const petitions: DashboardPetition[] = [
    {
      id: -301,
      title: '학교 행사 의견 수렴 창구를 확대해주세요',
      participantCount: 84,
      threshold: 100,
      endsAt: previewIso(8),
      status: 'open',
    },
    {
      id: -302,
      title: '학생 편의시설 개선 제안',
      participantCount: 57,
      threshold: 100,
      endsAt: previewIso(12),
      status: 'awaiting_answer',
    },
    {
      id: -303,
      title: '교내 소통 채널 운영 요청',
      participantCount: 102,
      threshold: 100,
      endsAt: previewIso(2),
      status: 'answered',
    },
  ];

  return {
    ...dashboard,
    notices: dashboard.notices.length ? dashboard.notices : notices,
    boardPosts: dashboard.boardPosts.length ? dashboard.boardPosts : boardPosts,
    petitions: dashboard.petitions.length ? dashboard.petitions : petitions,
  };
}

function MealColumn({
  type,
  meal,
  showEmpty,
}: {
  type: 'breakfast' | 'lunch' | 'dinner';
  meal?: SchoolMeal;
  showEmpty: boolean;
}) {
  const Icon = mealIcons[type];

  return (
    <div className="meal-column">
      <Icon aria-hidden="true" size={28} />
      <strong>{mealLabels[type]}</strong>
      {meal ? (
        <ul>
          {meal.dishes.map((dish) => (
            <li key={dish}>{dish}</li>
          ))}
        </ul>
      ) : showEmpty ? (
        <span className="meal-column__empty">등록된 식단이 없습니다.</span>
      ) : null}
      {meal?.calories ? <small>{meal.calories}</small> : null}
    </div>
  );
}

function MealCard({
  initialDate,
  initialMeals,
}: {
  initialDate: string;
  initialMeals: SchoolMeal[];
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
  const sharedStatus = mealsQuery.isFetching
    ? '식단을 불러오는 중입니다.'
    : meals.length === 0
      ? '등록된 식단이 없습니다.'
      : null;

  return (
    <section className="home-card meals-card" aria-busy={mealsQuery.isFetching}>
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
      <div className="meal-grid">
        <MealColumn
          type="breakfast"
          meal={mealsByType.get('breakfast')}
          showEmpty={!sharedStatus}
        />
        <MealColumn type="lunch" meal={mealsByType.get('lunch')} showEmpty={!sharedStatus} />
        <MealColumn type="dinner" meal={mealsByType.get('dinner')} showEmpty={!sharedStatus} />
        {sharedStatus ? <span className="meal-grid__status">{sharedStatus}</span> : null}
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
}: {
  year: number;
  month: number;
  day: number;
  events: AcademicEvent[];
  today: ReturnType<typeof getKoreaDateParts>;
}) {
  const isToday = year === today.year && month === today.month && day === today.day;
  const className = `mini-calendar__day${isToday ? ' is-today' : ''}${events.length ? ' has-events' : ''}`;
  const tooltipId = `calendar-events-${year}-${month}-${day}`;

  if (!events.length) {
    return (
      <span className={className} aria-current={isToday ? 'date' : undefined}>
        {day}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-current={isToday ? 'date' : undefined}
      aria-describedby={tooltipId}
      aria-label={`${year}년 ${month}월 ${day}일, 일정 ${events.length}개`}
    >
      <span>{day}</span>
      <span className="calendar-event-dots" aria-hidden="true">
        {events.slice(0, 3).map((event) => (
          <i key={event.id} />
        ))}
      </span>
      <span className="calendar-day-popover" id={tooltipId} role="tooltip">
        <strong>
          {month}월 {day}일
        </strong>
        {events.slice(0, 3).map((event) => (
          <span key={event.id}>{event.title}</span>
        ))}
        {events.length > 3 ? <small>+{events.length - 3}</small> : null}
      </span>
    </button>
  );
}

function CalendarCard({
  initialEvents,
  initialFrom,
  initialTo,
}: {
  initialEvents: AcademicEvent[];
  initialFrom: string;
  initialTo: string;
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
  const today = getKoreaDateParts();
  const days = buildCalendarDays(visibleMonth.year, visibleMonth.month);
  const eventsByDay = useMemo(() => {
    const map = new Map<number, AcademicEvent[]>();
    const lastDay = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 0)).getUTCDate();
    for (let day = 1; day <= lastDay; day += 1) {
      const key = dateKey(visibleMonth.year, visibleMonth.month, day);
      const matches = events.filter(
        (event) => toKoreaDateKey(event.startsAt) <= key && toKoreaDateKey(event.endsAt) >= key,
      );
      if (matches.length) map.set(day, matches);
    }
    return map;
  }, [events, visibleMonth.month, visibleMonth.year]);

  const upcoming = useMemo(() => {
    if (range.to < today.key) return [];
    const from = range.from <= today.key && today.key <= range.to ? today.key : range.from;
    const to = shiftDateKey(from, 6) < range.to ? shiftDateKey(from, 6) : range.to;
    return events
      .filter(
        (event) => toKoreaDateKey(event.startsAt) <= to && toKoreaDateKey(event.endsAt) >= from,
      )
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }, [events, range.from, range.to, today.key]);
  const visibleUpcoming = upcoming.slice(0, upcoming.length >= 3 ? 2 : 3);
  const hiddenUpcomingCount = upcoming.length >= 3 ? upcoming.length - 2 : 0;

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => shiftMonth(current.year, current.month, amount));
  };

  return (
    <section
      className="home-card schedule-card"
      id="academic-schedule"
      aria-busy={calendarQuery.isFetching}
    >
      <header className="home-card__header">
        <h2>학사일정</h2>
        <span className="home-card__meta">{visibleMonth.year}년</span>
      </header>

      <div className="calendar-heading">
        <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>
          <ChevronLeft aria-hidden="true" size={17} />
        </button>
        <div>
          <CalendarDays aria-hidden="true" size={18} />
          <strong>{visibleMonth.month}월</strong>
        </div>
        <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      </div>
      <div
        className={`mini-calendar${calendarQuery.isFetching ? ' is-loading' : ''}`}
        aria-label={`${visibleMonth.year}년 ${visibleMonth.month}월 달력`}
      >
        {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => (
          <span className="mini-calendar__weekday" key={weekday}>
            {weekday}
          </span>
        ))}
        {days.map((day, index) =>
          day ? (
            <CalendarDay
              key={day}
              year={visibleMonth.year}
              month={visibleMonth.month}
              day={day}
              events={eventsByDay.get(day) ?? []}
              today={today}
            />
          ) : (
            <span aria-hidden="true" key={`empty-${index}`} />
          ),
        )}
      </div>

      <div className="upcoming-events">
        <div className="upcoming-events__heading">
          <strong>다가오는 일정</strong>
          <span>{upcoming.length}건</span>
        </div>
        <ul aria-label="일주일 이내 일정">
          {visibleUpcoming.map((event) => (
            <li key={event.id}>
              <time dateTime={event.startsAt}>{formatDate(event.startsAt)}</time>
              <span>{event.title}</span>
            </li>
          ))}
          {hiddenUpcomingCount ? (
            <li
              className="upcoming-events__more"
              aria-label={`일정 ${hiddenUpcomingCount}개 더 있음`}
            >
              +{hiddenUpcomingCount}
            </li>
          ) : null}
          {!upcoming.length ? (
            <li className="upcoming-events__empty">다가오는 일정이 없습니다.</li>
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
      </section>
    );
  }

  const dashboard = withHomePreviewData(dashboardQuery.data);
  const featuredNotice = dashboard.notices.find((notice) => notice.pinned) ?? dashboard.notices[0];

  return (
    <div className="home-dashboard">
      <h1 className="sr-only">과구리 학생 정보포털</h1>
      <aside className="announcement-bar" aria-label="주요 안내">
        <div className="announcement-bar__label">
          <Bell aria-hidden="true" size={17} />
          <strong>안내</strong>
        </div>
        <span>{featuredNotice?.title ?? '과구리 학생 정보포털을 이용해 주세요.'}</span>
        {featuredNotice ? (
          <Link to="/notices" className="announcement-bar__link">
            자세히 보기 <ChevronRight aria-hidden="true" size={16} />
          </Link>
        ) : null}
      </aside>

      <div className="home-primary-grid">
        <section className="home-card notices-card">
          <header className="home-card__header">
            <h2>공지사항</h2>
            <Link to="/notices">
              더보기 <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </header>
          <ul className="notice-preview-list">
            {dashboard.notices.slice(0, 5).map((notice) => (
              <li key={notice.id}>
                <Link to="/notices">
                  <span className={`home-badge ${notice.pinned ? 'home-badge--danger' : ''}`}>
                    {notice.pinned ? '중요' : notice.department || '일반'}
                  </span>
                  <strong>{notice.title}</strong>
                  <time dateTime={notice.publishedAt}>{formatDate(notice.publishedAt)}</time>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <MealCard initialDate={dashboard.schoolData.mealDate} initialMeals={dashboard.meals} />

        <CalendarCard
          initialEvents={dashboard.academicEvents}
          initialFrom={dashboard.schoolData.scheduleFrom}
          initialTo={dashboard.schoolData.scheduleTo}
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
          <ul className="community-preview-list">
            {dashboard.boardPosts.slice(0, 5).map((post) => (
              <li key={post.id}>
                <span className="community-avatar" aria-hidden="true">
                  {(post.authorName ?? '익').slice(0, 1)}
                </span>
                <Link to="/boards/free">
                  <span>{post.title}</span>
                  <small className="community-comments">[{post.commentCount}]</small>
                </Link>
                <span>{post.authorName ?? '익명'}</span>
                <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-card petitions-card">
          <header className="home-card__header">
            <h2>청원·제안</h2>
            <Link to="/petitions">
              더보기 <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </header>
          <ul className="petition-preview-list">
            {dashboard.petitions.slice(0, 3).map((petition) => {
              const status = petitionStatus[petition.status] ?? petitionStatus.expired;
              return (
                <li key={petition.id}>
                  <span className={`home-badge home-badge--${status.tone}`}>{status.label}</span>
                  <Link to="/petitions">
                    <strong>{petition.title}</strong>
                    <span>
                      <Users aria-hidden="true" size={14} /> 참여 {petition.participantCount}명 ·
                      목표 {petition.threshold}명
                    </span>
                  </Link>
                  <time dateTime={petition.endsAt}>{formatDate(petition.endsAt)}</time>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

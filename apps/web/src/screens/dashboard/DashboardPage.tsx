import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  MessageCircle,
  MoonStar,
  Sunrise,
  Sun,
  Users,
} from 'lucide-react';
import type { AcademicEvent, SchoolMeal, SchoolMealType } from '@jshsus/types';
import { getHomeDashboard } from '../../lib/api';

const KOREA_TIME_ZONE = 'Asia/Seoul';

const mealIcons: Record<SchoolMealType, typeof Sun> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: MoonStar,
  other: Sun,
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
  }).format(new Date(value));
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    ...options,
  }).format(new Date(value));
}

function formatDashboardDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(new Date(`${value}T12:00:00+09:00`));
}

function buildCalendarDays(year: number, month: number) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return [
    ...Array.from<null>({ length: firstWeekday }).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

function DashboardEmpty({ children }: { children: ReactNode }) {
  return <p className="dashboard-empty">{children}</p>;
}

function MealColumn({ meal }: { meal?: SchoolMeal }) {
  const Icon = meal ? mealIcons[meal.type] : Sun;

  return (
    <div className="meal-column">
      <Icon aria-hidden="true" size={28} />
      <strong>{meal?.typeLabel ?? '식단'}</strong>
      {meal ? (
        <ul>
          {meal.dishes.map((dish) => (
            <li key={dish}>{dish}</li>
          ))}
        </ul>
      ) : (
        <span className="meal-column__empty">등록된 식단이 없습니다.</span>
      )}
      {meal?.calories ? <small>{meal.calories}</small> : null}
    </div>
  );
}

function CalendarCard({ events }: { events: AcademicEvent[] }) {
  const today = getKoreaDateParts();
  const days = buildCalendarDays(today.year, today.month);
  const eventDays = new Set(
    events
      .filter((event) => {
        const [year, month] = toKoreaDateKey(event.startsAt).split('-').map(Number);
        return year === today.year && month === today.month;
      })
      .map((event) => Number(toKoreaDateKey(event.startsAt).slice(-2))),
  );
  const upcoming = events
    .filter((event) => toKoreaDateKey(event.endsAt) >= today.key)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, 4);

  return (
    <section className="home-card schedule-card" id="academic-schedule">
      <header className="home-card__header">
        <h2>학사일정</h2>
        <span className="home-card__meta">{today.year}년</span>
      </header>

      <div className="calendar-heading">
        <CalendarDays aria-hidden="true" size={18} />
        <strong>{today.month}월</strong>
      </div>
      <div className="mini-calendar" aria-label={`${today.year}년 ${today.month}월 달력`}>
        {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => (
          <span className="mini-calendar__weekday" key={weekday}>
            {weekday}
          </span>
        ))}
        {days.map((day, index) =>
          day ? (
            <span
              className={`mini-calendar__day${day === today.day ? ' is-today' : ''}${eventDays.has(day) ? ' has-event' : ''}`}
              key={day}
              aria-current={day === today.day ? 'date' : undefined}
            >
              {day}
            </span>
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
        {upcoming.length ? (
          <ul>
            {upcoming.map((event) => (
              <li key={event.id}>
                <time dateTime={event.startsAt}>{formatDate(event.startsAt)}</time>
                <span>{event.title}</span>
                {event.source === 'school' ? <small>학교</small> : null}
              </li>
            ))}
          </ul>
        ) : (
          <DashboardEmpty>다가오는 일정이 없습니다.</DashboardEmpty>
        )}
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

  const dashboard = dashboardQuery.data;
  const featuredNotice = dashboard.notices.find((notice) => notice.pinned) ?? dashboard.notices[0];
  const mealsByType = new Map(dashboard.meals.map((meal) => [meal.type, meal]));

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
          {dashboard.notices.length ? (
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
          ) : (
            <DashboardEmpty>등록된 공지사항이 없습니다.</DashboardEmpty>
          )}
        </section>

        <section className="home-card meals-card">
          <header className="home-card__header">
            <div>
              <h2>오늘의 식단</h2>
              <span className="home-card__meta">
                {formatDashboardDate(dashboard.schoolData.mealDate)}
              </span>
            </div>
            {dashboard.schoolData.availability !== 'available' ? (
              <span className="home-data-status">일부 정보 미연동</span>
            ) : null}
          </header>
          <div className="meal-grid">
            <MealColumn meal={mealsByType.get('breakfast')} />
            <MealColumn meal={mealsByType.get('lunch')} />
            <MealColumn meal={mealsByType.get('dinner')} />
          </div>
        </section>

        <CalendarCard events={dashboard.academicEvents} />
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
              {dashboard.boardPosts.slice(0, 5).map((post) => (
                <li key={post.id}>
                  <span className="community-avatar" aria-hidden="true">
                    {(post.authorName ?? '익').slice(0, 1)}
                  </span>
                  <Link to="/boards/free">{post.title}</Link>
                  <span>{post.authorName ?? '익명'}</span>
                  <span className="community-comments">
                    <MessageCircle aria-hidden="true" size={14} /> {post.commentCount}
                  </span>
                  <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardEmpty>등록된 게시글이 없습니다.</DashboardEmpty>
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
          ) : (
            <DashboardEmpty>진행 중인 청원이 없습니다.</DashboardEmpty>
          )}
        </section>
      </div>
    </div>
  );
}

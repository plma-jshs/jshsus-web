import {
  Link,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { AppShell } from '../components/layout/AppShell';
import { PageScaffold, PageState } from '../components/page/PageScaffold';
import { getSession } from '../features/auth/api';
import { AccountActivationPage } from '../features/auth/AccountActivationPage';
import { LoginPage } from '../features/auth/LoginPage';
import { PasswordResetPage } from '../features/auth/PasswordResetPage';
import { SsoCallbackPage } from '../features/auth/SsoCallbackPage';
import { SsoLogoutPage } from '../features/auth/SsoLogoutPage';
import '../styles/not-found.css';

const tablePageSizes = [20, 50, 100] as const;
const tableSearchFields = ['title_content', 'title', 'author'] as const;

type TableSearch = {
  page?: number;
  size?: (typeof tablePageSizes)[number];
  field?: (typeof tableSearchFields)[number];
  q?: string;
};

type CalendarSearch = {
  date?: string;
};

type ActivitySearch = {
  page?: number;
  size?: (typeof tablePageSizes)[number];
  field?: 'all' | 'activity' | 'participants' | 'location' | 'advisor';
  q?: string;
};

const activitySearchFields = ['all', 'activity', 'participants', 'location', 'advisor'] as const;

function safeInternalReturnTo(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value.slice(0, 500)
    : undefined;
}

function validateActivitySearch(search: Record<string, unknown>): ActivitySearch {
  const result: ActivitySearch = {};
  const requestedPage = Number(search.page);
  const requestedPageSize = Number(search.size ?? search.pageSize);

  if (Number.isInteger(requestedPage) && requestedPage >= 1) result.page = requestedPage;
  if (tablePageSizes.includes(requestedPageSize as (typeof tablePageSizes)[number])) {
    result.size = requestedPageSize as (typeof tablePageSizes)[number];
  }
  if (activitySearchFields.includes(search.field as (typeof activitySearchFields)[number])) {
    result.field = search.field as ActivitySearch['field'];
  }
  if (typeof search.q === 'string' && search.q.trim()) result.q = search.q.trim().slice(0, 100);
  return result;
}

function isDateSearch(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function validateTableSearch(search: Record<string, unknown>): TableSearch {
  const requestedPage = Number(search.page);
  const requestedPageSize = Number(search.size ?? search.pageSize);
  const result: TableSearch = {};

  if (Number.isInteger(requestedPage) && requestedPage >= 1) result.page = requestedPage;
  if (tablePageSizes.includes(requestedPageSize as (typeof tablePageSizes)[number])) {
    result.size = requestedPageSize as (typeof tablePageSizes)[number];
  }
  if (tableSearchFields.includes(search.field as (typeof tableSearchFields)[number])) {
    result.field = search.field as (typeof tableSearchFields)[number];
  }
  if (typeof search.q === 'string' && search.q.trim()) {
    result.q = search.q.trim().slice(0, 100);
  }

  return result;
}

function validateCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  return isDateSearch(search.date) ? { date: search.date } : {};
}

async function requireSession(location: { href: string }) {
  const session = await getSession();

  if (!session.isLogined) {
    throw redirect({ to: '/login', search: { returnTo: location.href } });
  }
}

async function requirePermission(location: { href: string }, permission: string) {
  const session = await getSession();

  if (!session.isLogined) {
    throw redirect({ to: '/login', search: { returnTo: location.href } });
  }
  if (!session.permissions.includes(permission)) {
    throw redirect({ to: '/notices' });
  }
}

function RouteNotFound() {
  return (
    <section className="route-not-found" aria-label="페이지를 찾을 수 없습니다">
      <img src="/images/jin-ramen.png" alt="회전하는 진라면 용기" />
      <PageState
        kind="empty"
        variant="page"
        title="페이지를 찾을 수 없습니다."
        description="주소를 다시 확인하거나 홈으로 돌아가 주세요."
        action={
          <Link className="detail-primary-button" to="/">
            홈으로
          </Link>
        }
      />
    </section>
  );
}

function RouteError({ reset }: ErrorComponentProps) {
  return (
    <div className="route-fallback">
      <PageScaffold
        breadcrumbs={[{ label: '오류' }]}
        title="페이지를 열지 못했습니다"
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title="화면을 불러오는 중 문제가 발생했습니다."
          description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
          action={
            <button className="detail-primary-button" type="button" onClick={reset}>
              다시 시도
            </button>
          }
        />
      </PageScaffold>
    </div>
  );
}

function RoutePending() {
  return (
    <section className="route-pending" aria-busy="true" aria-label="화면을 불러오는 중">
      <span className="sr-only" role="status">
        화면을 불러오는 중입니다.
      </span>
      <div className="route-pending__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('../features/home/DashboardPage'), 'DashboardPage'),
});

const noticesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices',
  validateSearch: validateTableSearch,
  component: lazyRouteComponent(() => import('../features/notices/NoticesPage'), 'NoticesPage'),
});

const newNoticeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices/new',
  beforeLoad: ({ location }) => requirePermission(location, 'notices.manage'),
  component: lazyRouteComponent(() => import('../features/notices/NewNoticePage'), 'NewNoticePage'),
});

const editNoticeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices/$noticeId/edit',
  beforeLoad: ({ location }) => requirePermission(location, 'notices.manage'),
  component: lazyRouteComponent(
    () => import('../features/notices/EditNoticePage'),
    'EditNoticePage',
  ),
});

const noticeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices/$noticeId',
  component: lazyRouteComponent(
    () => import('../features/notices/NoticeDetailPage'),
    'NoticeDetailPage',
  ),
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  validateSearch: validateCalendarSearch,
  component: lazyRouteComponent(() => import('../features/calendar/CalendarPage'), 'CalendarPage'),
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free',
  beforeLoad: ({ location }) => requireSession(location),
  validateSearch: validateTableSearch,
  component: lazyRouteComponent(() => import('../features/boards/BoardPage'), 'BoardPage'),
});

const newBoardPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free/new',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/boards/NewBoardPostPage'),
    'NewBoardPostPage',
  ),
});

const editBoardPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free/$postId/edit',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/boards/EditBoardPostPage'),
    'EditBoardPostPage',
  ),
});

const boardPostDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free/$postId',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/boards/BoardPostDetailPage'),
    'BoardPostDetailPage',
  ),
});

const petitionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/petitions/PetitionsPage'),
    'PetitionsPage',
  ),
});

const newPetitionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions/new',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/petitions/NewPetitionPage'),
    'NewPetitionPage',
  ),
});

const editPetitionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions/$petitionId/edit',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/petitions/EditPetitionPage'),
    'EditPetitionPage',
  ),
});

const petitionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions/$petitionId',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/petitions/PetitionDetailPage'),
    'PetitionDetailPage',
  ),
});

const thanksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/thanks',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(() => import('../features/thanks/ThanksPage'), 'ThanksPage'),
});

const jbsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jbs',
  validateSearch: validateTableSearch,
  component: lazyRouteComponent(() => import('../features/jbs/JbsPage'), 'JbsPage'),
});

const newJbsPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jbs/new',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(() => import('../features/jbs/NewJbsPostPage'), 'NewJbsPostPage'),
});

const editJbsPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jbs/$postId/edit',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(() => import('../features/jbs/EditJbsPostPage'), 'EditJbsPostPage'),
});

const jbsPostDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jbs/$postId',
  component: lazyRouteComponent(
    () => import('../features/jbs/JbsPostDetailPage'),
    'JbsPostDetailPage',
  ),
});

const wakeSongsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wake-songs',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/wake-songs/WakeSongsPage'),
    'WakeSongsPage',
  ),
});

const byteCalculatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tools/bytes',
  component: lazyRouteComponent(
    () => import('../features/byte-calculator/ByteCalculatorPage'),
    'ByteCalculatorPage',
  ),
});

const cannonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tools/cannon',
  component: lazyRouteComponent(() => import('../features/cannon/CannonPage'), 'CannonPage'),
});

const legacyByteCalculatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/bytes',
  beforeLoad: () => {
    throw redirect({ to: '/tools/bytes' });
  },
});

const activityRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests',
  beforeLoad: ({ location }) => requireSession(location),
  validateSearch: validateActivitySearch,
  component: lazyRouteComponent(
    () => import('../features/activity-requests/ActivityRequestsPage'),
    'ActivityRequestsPage',
  ),
});

const newActivityRequestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests/new',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/activity-requests/NewActivityRequestPage'),
    'NewActivityRequestPage',
  ),
});

const activityRequestDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests/$requestId',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/activity-requests/ActivityRequestDetailPage'),
    'ActivityRequestDetailPage',
  ),
});

const editActivityRequestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests/$requestId/edit',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/activity-requests/EditActivityRequestPage'),
    'EditActivityRequestPage',
  ),
});

const myStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/my-status',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(() => import('../features/my-status/MyStatusPage'), 'MyStatusPage'),
});

const pointsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/points',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(() => import('../features/points/PointsPage'), 'PointsPage'),
});

const lostItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lost-items',
  component: lazyRouteComponent(
    () => import('../features/lost-items/LostItemsPage'),
    'LostItemsPage',
  ),
});

const newLostItemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lost-items/new',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/lost-items/NewLostItemPage'),
    'NewLostItemPage',
  ),
});

const lostItemDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lost-items/$itemId',
  component: lazyRouteComponent(
    () => import('../features/lost-items/LostItemDetailPage'),
    'LostItemDetailPage',
  ),
});

const dormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dorm',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(() => import('../features/dorm/DormPage'), 'DormPage'),
});

const newDormReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dorm/reports/new',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(
    () => import('../features/dorm/NewDormReportPage'),
    'NewDormReportPage',
  ),
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: lazyRouteComponent(() => import('../features/static/AboutPage'), 'AboutPage'),
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: lazyRouteComponent(() => import('../features/static/PrivacyPage'), 'PrivacyPage'),
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: lazyRouteComponent(() => import('../features/static/TermsPage'), 'TermsPage'),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.sso === 'string' ? { sso: search.sso } : {}),
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }),
  component: LoginPage,
});

const ssoCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: SsoCallbackPage,
});

const ssoLogoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/logout',
  component: SsoLogoutPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  validateSearch: (search: Record<string, unknown>) => ({
    username: typeof search.username === 'string' ? search.username : undefined,
    returnTo: safeInternalReturnTo(search.returnTo),
  }),
  component: PasswordResetPage,
});

const accountActivationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account-activation',
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeInternalReturnTo(search.returnTo),
  }),
  component: AccountActivationPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  noticesRoute,
  newNoticeRoute,
  editNoticeRoute,
  noticeDetailRoute,
  calendarRoute,
  boardRoute,
  newBoardPostRoute,
  editBoardPostRoute,
  boardPostDetailRoute,
  petitionsRoute,
  newPetitionRoute,
  editPetitionRoute,
  petitionDetailRoute,
  thanksRoute,
  jbsRoute,
  newJbsPostRoute,
  editJbsPostRoute,
  jbsPostDetailRoute,
  wakeSongsRoute,
  byteCalculatorRoute,
  cannonRoute,
  legacyByteCalculatorRoute,
  activityRequestsRoute,
  newActivityRequestRoute,
  activityRequestDetailRoute,
  editActivityRequestRoute,
  myStatusRoute,
  pointsRoute,
  lostItemsRoute,
  newLostItemRoute,
  lostItemDetailRoute,
  dormRoute,
  newDormReportRoute,
  aboutRoute,
  privacyRoute,
  termsRoute,
  loginRoute,
  ssoCallbackRoute,
  ssoLogoutRoute,
  forgotPasswordRoute,
  accountActivationRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPendingComponent: RoutePending,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

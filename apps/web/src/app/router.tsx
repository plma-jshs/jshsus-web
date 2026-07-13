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

const tablePageSizes = [10, 20, 30, 50] as const;
const tableSearchFields = ['title_content', 'title', 'author'] as const;

type TableSearch = {
  page?: number;
  pageSize?: (typeof tablePageSizes)[number];
  field?: (typeof tableSearchFields)[number];
  q?: string;
};

function validateTableSearch(search: Record<string, unknown>): TableSearch {
  const requestedPage = Number(search.page);
  const requestedPageSize = Number(search.pageSize);
  const result: TableSearch = {};

  if (Number.isInteger(requestedPage) && requestedPage > 1) result.page = requestedPage;
  if (tablePageSizes.includes(requestedPageSize as (typeof tablePageSizes)[number])) {
    result.pageSize = requestedPageSize as (typeof tablePageSizes)[number];
  }
  if (tableSearchFields.includes(search.field as (typeof tableSearchFields)[number])) {
    result.field = search.field as (typeof tableSearchFields)[number];
  }
  if (typeof search.q === 'string' && search.q.trim()) {
    result.q = search.q.trim().slice(0, 100);
  }

  return result;
}

async function requireSession(location: { href: string }) {
  const session = await getSession();

  if (!session.isLogined) {
    throw redirect({ to: '/login', search: { returnTo: location.href } });
  }
}

function RouteNotFound() {
  return (
    <div className="route-fallback">
      <PageScaffold
        breadcrumbs={[{ label: '페이지 없음' }]}
        title="페이지를 찾을 수 없습니다"
        width="reading"
        variant="document"
      >
        <PageState
          kind="empty"
          variant="page"
          title="요청한 주소에 페이지가 없습니다."
          description="주소를 확인하거나 홈으로 돌아가 주세요."
          action={
            <Link className="detail-primary-button" to="/">
              홈으로
            </Link>
          }
        />
      </PageScaffold>
    </div>
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
  component: lazyRouteComponent(() => import('../features/calendar/CalendarPage'), 'CalendarPage'),
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free',
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

const boardPostDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free/$postId',
  component: lazyRouteComponent(
    () => import('../features/boards/BoardPostDetailPage'),
    'BoardPostDetailPage',
  ),
});

const petitionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions',
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

const petitionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions/$petitionId',
  component: lazyRouteComponent(
    () => import('../features/petitions/PetitionDetailPage'),
    'PetitionDetailPage',
  ),
});

const activityRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests',
  beforeLoad: ({ location }) => requireSession(location),
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

const myStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/my-status',
  beforeLoad: ({ location }) => requireSession(location),
  component: lazyRouteComponent(() => import('../features/my-status/MyStatusPage'), 'MyStatusPage'),
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

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }),
  component: lazyRouteComponent(() => import('../features/auth/LoginPage'), 'LoginPage'),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  noticesRoute,
  noticeDetailRoute,
  calendarRoute,
  boardRoute,
  newBoardPostRoute,
  boardPostDetailRoute,
  petitionsRoute,
  newPetitionRoute,
  petitionDetailRoute,
  activityRequestsRoute,
  newActivityRequestRoute,
  activityRequestDetailRoute,
  myStatusRoute,
  lostItemsRoute,
  newLostItemRoute,
  lostItemDetailRoute,
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

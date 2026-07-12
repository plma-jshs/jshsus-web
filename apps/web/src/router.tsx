import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './screens/dashboard/DashboardPage';
import { ActivityRequestsPage } from './screens/activity/ActivityRequestsPage';
import { BoardPage } from './screens/content/BoardPage';
import { LostItemsPage } from './screens/content/LostItemsPage';
import { NoticesPage } from './screens/content/NoticesPage';
import { PetitionsPage } from './screens/petitions/PetitionsPage';
import { MyStatusPage } from './screens/status/MyStatusPage';
import { LoginPage } from './screens/auth/LoginPage';

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const noticesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices',
  component: NoticesPage,
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free',
  component: BoardPage,
});

const petitionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions',
  component: PetitionsPage,
});

const activityRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests',
  component: ActivityRequestsPage,
});

const myStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/my-status',
  component: MyStatusPage,
});

const lostItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lost-items',
  component: LostItemsPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  noticesRoute,
  boardRoute,
  petitionsRoute,
  activityRequestsRoute,
  myStatusRoute,
  lostItemsRoute,
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

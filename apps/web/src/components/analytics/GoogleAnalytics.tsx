import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __jshsusGoogleTagConfigured?: string;
  }
}

const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim();
let configuredMeasurementId: string | null = null;

const PUBLIC_EXACT_PATHS = new Set([
  '/',
  '/about',
  '/bytes',
  '/calendar',
  '/jbs',
  '/lost-items',
  '/notices',
  '/privacy',
  '/terms',
  '/tools/bytes',
  '/tools/cannon',
]);

const PUBLIC_DETAIL_PATHS = [/^\/jbs\/[^/]+$/, /^\/lost-items\/[^/]+$/, /^\/notices\/[^/]+$/];

function isPublicAnalyticsPath(pathname: string) {
  if (
    pathname.endsWith('/new') ||
    pathname.endsWith('/edit') ||
    pathname.startsWith('/auth/') ||
    pathname === '/login' ||
    pathname === '/logout' ||
    pathname === '/forgot-password' ||
    pathname === '/account-activation'
  ) {
    return false;
  }

  return (
    PUBLIC_EXACT_PATHS.has(pathname) ||
    PUBLIC_DETAIL_PATHS.some((pattern) => pattern.test(pathname))
  );
}

function configureGoogleAnalytics() {
  if (!measurementId) return null;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args));
  const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = scriptSrc;
    document.head.appendChild(script);
  }

  if (configuredMeasurementId !== measurementId) {
    if (window.__jshsusGoogleTagConfigured !== measurementId) {
      window.gtag('js', new Date());
      window.gtag('config', measurementId, { send_page_view: false });
      window.__jshsusGoogleTagConfigured = measurementId;
    }
    configuredMeasurementId = measurementId;
  }
  return window.gtag;
}

export function GoogleAnalytics() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const hash = useRouterState({ select: (state) => state.location.hash });

  useEffect(() => {
    if (!isPublicAnalyticsPath(pathname)) return;

    const gtag = configureGoogleAnalytics();
    if (!gtag) return;

    gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${pathname}${window.location.search}${window.location.hash}`,
    });
  }, [hash, pathname, search]);

  return null;
}

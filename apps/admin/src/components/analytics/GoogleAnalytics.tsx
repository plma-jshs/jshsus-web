import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim();
let configuredMeasurementId: string | null = null;

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
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: false });
    configuredMeasurementId = measurementId;
  }

  return window.gtag;
}

export function GoogleAnalytics() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const hash = useRouterState({ select: (state) => state.location.hash });

  useEffect(() => {
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

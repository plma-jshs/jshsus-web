import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './app/router';
import { ToastProvider } from './components/ui/Toast';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/global.css';
import '@jshsus/ui/control-policy.css';

// A release replaces hashed Vite chunks atomically. A tab that was left open
// across that replacement can otherwise request a chunk that no longer exists
// and get stuck on Vite's "Unable to preload CSS" error screen. Retry once per
// short window so the browser picks up the new index/chunk manifest without
// risking a reload loop when the network is genuinely unavailable.
const VITE_PRELOAD_RETRY_KEY = 'jshsus-vite-preload-retry';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const now = Date.now();
  try {
    const lastAttempt = Number(sessionStorage.getItem(VITE_PRELOAD_RETRY_KEY) ?? 0);
    if (Number.isFinite(lastAttempt) && now - lastAttempt < 10_000) return;
    sessionStorage.setItem(VITE_PRELOAD_RETRY_KEY, String(now));
  } catch {
    // Private browsing can deny sessionStorage. A one-shot reload is still
    // safer than leaving the application on a blank route error.
  }
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

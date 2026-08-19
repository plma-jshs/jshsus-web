import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './app/router';
import { ToastProvider } from './components/feedback/Toast';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/global.css';
import '@jshsus/ui/control-policy.css';

// Recover tabs that span an atomic release and still reference a removed
// hashed Vite chunk. The short session guard prevents an infinite reload loop.
const VITE_PRELOAD_RETRY_KEY = 'jshsus-vite-preload-retry';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const now = Date.now();
  try {
    const lastAttempt = Number(sessionStorage.getItem(VITE_PRELOAD_RETRY_KEY) ?? 0);
    if (Number.isFinite(lastAttempt) && now - lastAttempt < 10_000) return;
    sessionStorage.setItem(VITE_PRELOAD_RETRY_KEY, String(now));
  } catch {
    // Continue with a one-shot reload when storage is unavailable.
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

import { useLayoutEffect, useRef } from 'react';

export function SsoLoginPage() {
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    const authorizeUrl = new URL('/api/auth/sso/authorize', window.location.origin);
    authorizeUrl.searchParams.set(
      'returnTo',
      `${window.location.pathname}${window.location.search}`,
    );
    window.location.replace(authorizeUrl.toString());
  }, []);

  return null;
}

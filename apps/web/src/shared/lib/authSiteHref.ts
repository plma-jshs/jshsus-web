type BrowserLocation = Pick<Location, 'hostname' | 'origin' | 'protocol'>;

export function getAuthSiteOrigin(location: BrowserLocation = window.location) {
  const { hostname, origin, protocol } = location;

  if (hostname === 'auth.jshsus.kr' || hostname === 'auth.localhost') return origin;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return `${protocol}//auth.localhost:5173`;
  }
  if (hostname === 'jshsus.kr' || hostname.endsWith('.jshsus.kr')) {
    return 'https://auth.jshsus.kr';
  }
  return origin;
}

export function getPasswordResetHref(
  username: string,
  returnTo: string,
  location: BrowserLocation = window.location,
) {
  const target = new URL('/forgot-password', getAuthSiteOrigin(location));
  const normalizedUsername = username.trim().replace(/^"+|"+$/g, '');
  if (normalizedUsername) target.searchParams.set('username', normalizedUsername);
  target.searchParams.set('returnTo', returnTo);
  return target.toString();
}

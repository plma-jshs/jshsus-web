type BrowserLocation = Pick<Location, 'hostname' | 'protocol'>;

export function getAdminSiteHref(location: BrowserLocation = window.location) {
  const { hostname, protocol } = location;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return `${protocol}//${hostname}:5174`;
  }
  if (hostname === 'v26.jshsus.kr') return 'https://admin-v26.jshsus.kr';
  return 'https://admin.jshsus.kr';
}

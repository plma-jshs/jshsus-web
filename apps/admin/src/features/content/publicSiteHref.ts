export function publicSiteHref(path: string) {
  if (typeof window === 'undefined') return path;

  const url = new URL(path, window.location.origin);
  if (url.port === '5174') url.port = '5173';
  if (url.hostname.startsWith('admin-')) url.hostname = url.hostname.slice('admin-'.length);
  if (url.hostname.startsWith('admin.')) url.hostname = url.hostname.slice('admin.'.length);
  return url.toString();
}

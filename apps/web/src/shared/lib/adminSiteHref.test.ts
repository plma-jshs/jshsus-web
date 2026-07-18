import { describe, expect, it } from 'vitest';
import { getAdminSiteHref } from './adminSiteHref';

describe('getAdminSiteHref', () => {
  it.each([
    ['localhost', 'http:', 'http://localhost:5174'],
    ['127.0.0.1', 'http:', 'http://127.0.0.1:5174'],
    ['v26.jshsus.kr', 'https:', 'https://admin-v26.jshsus.kr'],
    ['jshsus.kr', 'https:', 'https://admin.jshsus.kr'],
  ])('maps %s to its matching admin site', (hostname, protocol, expected) => {
    expect(getAdminSiteHref({ hostname, protocol })).toBe(expected);
  });
});

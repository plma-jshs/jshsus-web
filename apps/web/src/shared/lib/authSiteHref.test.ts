import { describe, expect, it } from 'vitest';
import { getAuthSiteOrigin, getPasswordResetHref } from './authSiteHref';

describe('authSiteHref', () => {
  it('routes production service pages to the central auth origin', () => {
    const location = {
      hostname: 'v26.jshsus.kr',
      origin: 'https://v26.jshsus.kr',
      protocol: 'https:',
    };

    expect(getAuthSiteOrigin(location)).toBe('https://auth.jshsus.kr');
    expect(getPasswordResetHref('"9999"', '/my-status', location)).toBe(
      'https://auth.jshsus.kr/forgot-password?username=9999&returnTo=%2Fmy-status&returnOrigin=https%3A%2F%2Fv26.jshsus.kr',
    );
  });

  it('uses the local auth host during development', () => {
    expect(
      getAuthSiteOrigin({
        hostname: 'localhost',
        origin: 'http://localhost:5173',
        protocol: 'http:',
      }),
    ).toBe('http://auth.localhost:5173');
  });
});

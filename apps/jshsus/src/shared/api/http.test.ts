import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearCsrfToken, request } from './http';

describe('shared API client', () => {
  afterEach(() => {
    clearCsrfToken();
    vi.unstubAllGlobals();
  });

  it('sends JSON requests with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(request<{ ok: boolean }>('/api/notices')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/notices', {
      method: 'GET',
      credentials: 'include',
      headers: { accept: 'application/json' },
      body: undefined,
    });
  });

  it('loads and reuses a CSRF token for mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'token-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await request('/api/reports', { method: 'POST', body: { reason: 'test' } });
    await request('/api/reports', { method: 'POST', body: { reason: 'test-2' } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': 'token-1',
      },
    });
  });

  it('preserves structured error payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'invalid' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const error = await request('/api/notices').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, payload: { message: 'invalid' } });
  });
});

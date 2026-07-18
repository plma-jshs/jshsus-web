import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YouTubeDataApiService } from './youtube-data-api.service';

const videoId = 'dQw4w9WgXcQ';

function responseBody(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: videoId,
        snippet: { title: '테스트 영상', channelTitle: '테스트 채널' },
        contentDetails: { duration: 'PT3M30S' },
        status: { embeddable: true, uploadStatus: 'processed' },
        ...overrides,
      },
    ],
  };
}

function serviceWithKey() {
  const service = new YouTubeDataApiService();
  Reflect.set(service, 'apiKey', 'test-api-key');
  return service;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('YouTubeDataApiService', () => {
  it('uses videos.list with a header key and caches successful metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = serviceWithKey();

    const [first, second] = await Promise.all([
      service.inspect(`https://youtu.be/${videoId}`),
      service.inspect(`https://www.youtube.com/watch?v=${videoId}`),
    ]);

    expect(first).toEqual({
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      title: '테스트 영상',
      channelTitle: '테스트 채널',
      durationSeconds: 210,
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain(
      `/youtube/v3/videos?part=snippet%2CcontentDetails%2Cstatus&id=${videoId}`,
    );
    expect(requestUrl).not.toContain('key=');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('test-api-key');
  });

  it('rejects an invalid URL before making an external request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(serviceWithKey().inspect('https://youtube.example/video')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an API key and never falls back', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new YouTubeDataApiService();
    Reflect.set(service, 'apiKey', '');

    await expect(service.inspect(`https://youtu.be/${videoId}`)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 429])('maps Google status %s to service unavailable', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(serviceWithKey().inspect(`https://youtu.be/${videoId}`)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects missing and non-embeddable videos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            responseBody({ status: { embeddable: false, uploadStatus: 'processed' } }),
          ),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(serviceWithKey().inspect(`https://youtu.be/${videoId}`)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(serviceWithKey().inspect(`https://youtu.be/${videoId}`)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an ID mismatch, malformed JSON and network errors without fallback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(responseBody({ id: 'abcdefghijk' })), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockRejectedValueOnce(new Error('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(serviceWithKey().inspect(`https://youtu.be/${videoId}`)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(serviceWithKey().inspect(`https://youtu.be/${videoId}`)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(serviceWithKey().inspect(`https://youtu.be/${videoId}`)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

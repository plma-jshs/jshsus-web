// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadYouTubeIframeApi,
  resetYouTubeIframeApiLoaderForTests,
  YouTubeSegmentPlayer,
} from './YouTubeSegmentPlayer';

type CapturedOptions = {
  events: {
    onReady: (event: { target: FakePlayer }) => void;
    onStateChange: (event: { target: FakePlayer; data: number }) => void;
  };
};

type FakePlayer = {
  cueVideoById: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  getAvailablePlaybackRates: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  getIframe: ReturnType<typeof vi.fn>;
  getPlayerState: ReturnType<typeof vi.fn>;
  pauseVideo: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  setPlaybackRate: ReturnType<typeof vi.fn>;
};

function installPlayerApi(player: FakePlayer, capture: (options: CapturedOptions) => void) {
  function Player(_element: HTMLElement, options: CapturedOptions) {
    capture(options);
    return player;
  }

  window.YT = {
    Player: Player as unknown as NonNullable<typeof window.YT>['Player'],
  };
}

function createPlayer(): FakePlayer {
  return {
    cueVideoById: vi.fn(),
    destroy: vi.fn(),
    getAvailablePlaybackRates: vi.fn(() => [0.5, 0.75, 1, 1.25, 1.5, 2]),
    getCurrentTime: vi.fn(() => 0),
    getIframe: vi.fn(() => document.createElement('iframe')),
    getPlayerState: vi.fn(() => 1),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    setPlaybackRate: vi.fn(),
  };
}

describe('YouTubeSegmentPlayer', () => {
  beforeEach(() => {
    resetYouTubeIframeApiLoaderForTests();
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    document
      .querySelectorAll('script[data-jshsus-youtube-iframe-api="true"]')
      .forEach((script) => script.remove());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('loads the official IFrame API script only once', async () => {
    const first = loadYouTubeIframeApi();
    const second = loadYouTubeIframeApi();

    expect(first).toBe(second);
    expect(document.querySelectorAll('script[data-jshsus-youtube-iframe-api="true"]')).toHaveLength(
      1,
    );

    const player = createPlayer();
    installPlayerApi(player, () => undefined);
    window.onYouTubeIframeAPIReady?.();

    await expect(first).resolves.toBe(window.YT);
  });

  it('applies segment and rate updates and disposes the player', async () => {
    const player = createPlayer();
    let options: CapturedOptions | undefined;
    installPlayerApi(player, (captured) => {
      options = captured;
    });

    const view = render(
      <YouTubeSegmentPlayer
        videoId="dQw4w9WgXcQ"
        startSeconds={10}
        endSeconds={190}
        playbackRate={1.25}
        title="테스트 영상"
      />,
    );

    await waitFor(() => expect(options).toBeDefined());
    act(() => options?.events.onReady({ target: player }));

    expect(player.cueVideoById).toHaveBeenLastCalledWith({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 10,
      endSeconds: 190,
    });
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(1.25);

    view.rerender(
      <YouTubeSegmentPlayer
        videoId="dQw4w9WgXcQ"
        startSeconds={30}
        endSeconds={120}
        playbackRate={2}
        title="수정한 영상"
      />,
    );

    expect(player.cueVideoById).toHaveBeenLastCalledWith({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 30,
      endSeconds: 120,
    });
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(2);

    player.getCurrentTime.mockReturnValue(121);
    vi.useFakeTimers();
    act(() => options?.events.onStateChange({ target: player, data: 1 }));
    act(() => vi.advanceTimersByTime(250));
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    expect(player.seekTo).toHaveBeenLastCalledWith(30, true);

    view.unmount();
    expect(player.destroy).toHaveBeenCalledOnce();
  });
});

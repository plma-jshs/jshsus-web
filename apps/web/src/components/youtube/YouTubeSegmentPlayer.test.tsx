// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
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
  playVideo: ReturnType<typeof vi.fn>;
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
    playVideo: vi.fn(),
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

    expect(player.cueVideoById).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenLastCalledWith(30, true);
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(2);

    player.pauseVideo.mockClear();
    player.seekTo.mockClear();
    player.getCurrentTime.mockReturnValue(121);
    vi.useFakeTimers();
    act(() => options?.events.onStateChange({ target: player, data: 1 }));
    act(() => vi.advanceTimersByTime(250));
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    expect(player.seekTo).toHaveBeenLastCalledWith(30, true);

    view.unmount();
    expect(player.destroy).toHaveBeenCalledOnce();
  });

  it('removes the loading cover as soon as the iframe player mounts', async () => {
    const player = createPlayer();
    installPlayerApi(player, () => undefined);

    const view = render(
      <YouTubeSegmentPlayer
        videoId="dQw4w9WgXcQ"
        startSeconds={0}
        endSeconds={180}
        playbackRate={1}
        title="테스트 영상"
      />,
    );

    await waitFor(() =>
      expect(view.container.querySelector('.youtube-segment-player')).toHaveAttribute(
        'data-player-status',
        'ready',
      ),
    );
    expect(view.queryByRole('status')).not.toBeInTheDocument();
  });

  it('toggles playback when the preview surface is clicked', async () => {
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
        playbackRate={1}
        title="테스트 영상"
      />,
    );
    await waitFor(() => expect(options).toBeDefined());
    act(() => options?.events.onReady({ target: player }));

    player.getPlayerState.mockReturnValue(2);
    fireEvent.click(view.getByRole('button', { name: '영상 재생' }));
    expect(player.playVideo).toHaveBeenCalledOnce();

    player.getPlayerState.mockReturnValue(1);
    fireEvent.click(view.getByRole('button', { name: '영상 일시정지' }));
    expect(player.pauseVideo).toHaveBeenCalledOnce();
  });
});

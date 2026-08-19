import { useEffect, useRef, useState } from 'react';

const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const YOUTUBE_SCRIPT_SELECTOR = 'script[data-jshsus-youtube-iframe-api="true"]';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYING_STATE = 1;

type YouTubePlayerEvent = { target: YouTubePlayer };
type YouTubeStateEvent = YouTubePlayerEvent & { data: number };

type CueVideoOptions = {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
};

type YouTubePlayer = {
  cueVideoById: (options: CueVideoOptions) => void;
  destroy: () => void;
  getAvailablePlaybackRates: () => number[] | undefined;
  getCurrentTime: () => number;
  getIframe?: () => HTMLIFrameElement;
  getPlayerState: () => number;
  setVolume?: (volume: number) => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  unloadModule?: (moduleName: string) => void;
};

type YouTubePlayerOptions = {
  width: string;
  height: string;
  host: string;
  videoId: string;
  playerVars: {
    autohide: 1;
    cc_load_policy: 0;
    controls: 0 | 1;
    enablejsapi: 1;
    end: number;
    iv_load_policy: 3;
    modestbranding: 1;
    origin: string;
    playsinline: 1;
    rel: 0;
    start: number;
  };
  events: {
    onError: () => void;
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubeStateEvent) => void;
  };
};

export type YouTubeIframeApi = {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeIframeApi> | null = null;

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeIframeApi>((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    const timeoutId = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error('YouTube IFrame API loading timed out.'));
    }, 15_000);

    const finish = () => {
      window.clearTimeout(timeoutId);
      if (!window.YT?.Player) {
        youtubeApiPromise = null;
        reject(new Error('YouTube IFrame API is unavailable.'));
        return;
      }
      resolve(window.YT);
    };

    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      finish();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(YOUTUBE_SCRIPT_SELECTOR);
    if (existingScript) {
      existingScript.addEventListener(
        'error',
        () => {
          window.clearTimeout(timeoutId);
          youtubeApiPromise = null;
          reject(new Error('YouTube IFrame API script failed to load.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = YOUTUBE_IFRAME_API_URL;
    script.dataset.jshsusYoutubeIframeApi = 'true';
    script.addEventListener(
      'error',
      () => {
        window.clearTimeout(timeoutId);
        youtubeApiPromise = null;
        reject(new Error('YouTube IFrame API script failed to load.'));
      },
      { once: true },
    );
    document.head.append(script);
  });

  return youtubeApiPromise;
}

export function resetYouTubeIframeApiLoaderForTests() {
  youtubeApiPromise = null;
}

export type YouTubeSegmentPlayerProps = {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  title: string;
  className?: string;
  /** Native YouTube controls are opt-in for read-only admin previews. */
  controls?: 0 | 1;
  volume?: number;
};

function normalizedSegment(startSeconds: number, endSeconds: number) {
  const start = Math.max(0, Math.floor(startSeconds));
  return { start, end: Math.max(start + 1, Math.floor(endSeconds)) };
}

function applyRate(player: YouTubePlayer, requestedRate: number) {
  const available = player.getAvailablePlaybackRates() ?? [];
  const rate = available.includes(requestedRate) ? requestedRate : 1;
  player.setPlaybackRate(rate);
}

export function YouTubeSegmentPlayer({
  videoId,
  startSeconds,
  endSeconds,
  playbackRate,
  title,
  className,
  controls = 1,
  volume = 100,
}: YouTubeSegmentPlayerProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const monitorRef = useRef<number | null>(null);
  const latestRef = useRef({ videoId, startSeconds, endSeconds, playbackRate, title, volume });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const stopMonitoring = () => {
    if (monitorRef.current !== null) {
      window.clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  };

  const cueCurrentSegment = (player: YouTubePlayer) => {
    const current = latestRef.current;
    if (!VIDEO_ID_PATTERN.test(current.videoId)) return;
    const segment = normalizedSegment(current.startSeconds, current.endSeconds);
    player.cueVideoById({
      videoId: current.videoId,
      startSeconds: segment.start,
      endSeconds: segment.end,
    });
    applyRate(player, current.playbackRate);
  };

  const startMonitoring = (player: YouTubePlayer) => {
    stopMonitoring();
    monitorRef.current = window.setInterval(() => {
      if (player.getPlayerState() !== PLAYING_STATE) return;
      const { start, end } = normalizedSegment(
        latestRef.current.startSeconds,
        latestRef.current.endSeconds,
      );
      const currentTime = player.getCurrentTime();
      if (currentTime < start - 0.5) {
        player.seekTo(start, true);
      } else if (currentTime >= end) {
        player.pauseVideo();
        player.seekTo(start, true);
      }
    }, 250);
  };

  useEffect(() => {
    latestRef.current = { videoId, startSeconds, endSeconds, playbackRate, title, volume };
  }, [videoId, startSeconds, endSeconds, playbackRate, title, volume]);

  useEffect(() => {
    let disposed = false;
    const initialSegment = normalizedSegment(startSeconds, endSeconds);
    const initialVideoId = videoId;
    void loadYouTubeIframeApi()
      .then((api) => {
        if (disposed || !targetRef.current) return;
        const player = new api.Player(targetRef.current, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube.com',
          videoId: initialVideoId,
          playerVars: {
            autohide: 1,
            cc_load_policy: 0,
            controls,
            enablejsapi: 1,
            end: initialSegment.end,
            iv_load_policy: 3,
            modestbranding: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
            start: initialSegment.start,
          },
          events: {
            onReady: (event) => {
              if (disposed) return;
              playerRef.current = event.target;
              readyRef.current = true;
              const iframe = event.target.getIframe?.();
              if (iframe) iframe.title = latestRef.current.title;
              event.target.unloadModule?.('captions');
              const currentSegment = normalizedSegment(
                latestRef.current.startSeconds,
                latestRef.current.endSeconds,
              );
              if (
                latestRef.current.videoId !== initialVideoId ||
                currentSegment.start !== initialSegment.start ||
                currentSegment.end !== initialSegment.end
              ) {
                cueCurrentSegment(event.target);
              } else {
                applyRate(event.target, latestRef.current.playbackRate);
              }
              event.target.setVolume?.(Math.min(100, Math.max(0, latestRef.current.volume)));
              setStatus('ready');
            },
            onStateChange: (event) => {
              if (event.data === PLAYING_STATE) {
                event.target.unloadModule?.('captions');
                applyRate(event.target, latestRef.current.playbackRate);
                startMonitoring(event.target);
              } else {
                stopMonitoring();
              }
            },
            onError: () => {
              stopMonitoring();
              if (!disposed) setStatus('error');
            },
          },
        });
        playerRef.current = player;
        setStatus('ready');
      })
      .catch(() => {
        if (!disposed) setStatus('error');
      });

    return () => {
      disposed = true;
      stopMonitoring();
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // The player instance is intentionally created once. Prop updates are
    // applied by focused effects below without reloading the API script.
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (readyRef.current && player && VIDEO_ID_PATTERN.test(videoId)) {
      cueCurrentSegment(player);
    }
  }, [videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!readyRef.current || !player) return;
    const segment = normalizedSegment(startSeconds, endSeconds);
    const currentTime = player.getCurrentTime();
    if (currentTime < segment.start || currentTime >= segment.end) {
      player.pauseVideo();
      player.seekTo(segment.start, true);
    }
  }, [startSeconds, endSeconds]);

  useEffect(() => {
    const player = playerRef.current;
    if (readyRef.current && player) applyRate(player, playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    const player = playerRef.current;
    if (readyRef.current) player?.setVolume?.(Math.min(100, Math.max(0, volume)));
  }, [volume]);

  useEffect(() => {
    const iframe = playerRef.current?.getIframe?.();
    if (iframe) iframe.title = title;
  }, [title]);

  const displayedStatus = VIDEO_ID_PATTERN.test(videoId) ? status : 'error';

  return (
    <div
      className={['youtube-segment-player', className].filter(Boolean).join(' ')}
      data-player-status={displayedStatus}
    >
      <div className="youtube-segment-player__target" ref={targetRef} />
      {displayedStatus === 'loading' ? (
        <span className="youtube-segment-player__state" role="status">
          미리보기를 준비하는 중입니다.
        </span>
      ) : null}
      {displayedStatus === 'error' ? (
        <span className="youtube-segment-player__state" role="alert">
          YouTube 미리보기를 불러오지 못했습니다.
        </span>
      ) : null}
    </div>
  );
}

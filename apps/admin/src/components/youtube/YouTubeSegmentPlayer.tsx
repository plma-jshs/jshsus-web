import { useEffect, useRef, useState } from 'react';

const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const YOUTUBE_SCRIPT_SELECTOR = 'script[data-jshsus-youtube-iframe-api="true"]';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYING_STATE = 1;

type YouTubePlayerEvent = { target: YouTubePlayer };
type YouTubeStateEvent = YouTubePlayerEvent & { data: number };
type CueVideoOptions = { videoId: string; startSeconds: number; endSeconds: number };

type YouTubePlayer = {
  cueVideoById: (options: CueVideoOptions) => void;
  destroy: () => void;
  getAvailablePlaybackRates: () => number[];
  getCurrentTime: () => number;
  getIframe?: () => HTMLIFrameElement;
  getPlayerState: () => number;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
};

type YouTubePlayerOptions = {
  width: string;
  height: string;
  host: string;
  playerVars: {
    controls: 0 | 1;
    enablejsapi: 1;
    origin: string;
    playsinline: 1;
    rel: 0;
  };
  events: {
    onError: () => void;
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubeStateEvent) => void;
  };
};

type YouTubeIframeApi = {
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

export type YouTubeSegmentPlayerProps = {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  title: string;
  className?: string;
};

function normalizedSegment(startSeconds: number, endSeconds: number) {
  const start = Math.max(0, Math.floor(startSeconds));
  return { start, end: Math.max(start + 1, Math.floor(endSeconds)) };
}

function applyRate(player: YouTubePlayer, requestedRate: number) {
  const available = player.getAvailablePlaybackRates();
  player.setPlaybackRate(available.includes(requestedRate) ? requestedRate : 1);
}

export function YouTubeSegmentPlayer({
  videoId,
  startSeconds,
  endSeconds,
  playbackRate,
  title,
  className,
}: YouTubeSegmentPlayerProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const monitorRef = useRef<number | null>(null);
  const latestRef = useRef({ videoId, startSeconds, endSeconds, playbackRate, title });
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
      if (currentTime < start - 0.5) player.seekTo(start, true);
      else if (currentTime >= end) {
        player.pauseVideo();
        player.seekTo(start, true);
      }
    }, 250);
  };

  useEffect(() => {
    latestRef.current = { videoId, startSeconds, endSeconds, playbackRate, title };
  }, [videoId, startSeconds, endSeconds, playbackRate, title]);

  useEffect(() => {
    let disposed = false;
    void loadYouTubeIframeApi()
      .then((api) => {
        if (disposed || !targetRef.current) return;
        const player = new api.Player(targetRef.current, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            controls: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (disposed) return;
              playerRef.current = event.target;
              readyRef.current = true;
              const iframe = event.target.getIframe?.();
              if (iframe) iframe.title = latestRef.current.title;
              cueCurrentSegment(event.target);
              setStatus('ready');
            },
            onStateChange: (event) => {
              if (event.data === PLAYING_STATE) {
                applyRate(event.target, latestRef.current.playbackRate);
                startMonitoring(event.target);
              } else stopMonitoring();
            },
            onError: () => {
              stopMonitoring();
              if (!disposed) setStatus('error');
            },
          },
        });
        playerRef.current = player;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (readyRef.current && player && VIDEO_ID_PATTERN.test(videoId)) {
      cueCurrentSegment(player);
    }
  }, [videoId, startSeconds, endSeconds]);

  useEffect(() => {
    const player = playerRef.current;
    if (readyRef.current && player) applyRate(player, playbackRate);
  }, [playbackRate]);

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

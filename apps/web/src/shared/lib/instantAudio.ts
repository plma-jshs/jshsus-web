import { useCallback, useEffect, useRef } from 'react';

type AudioContextConstructor = typeof AudioContext;

export function useInstantAudio(src: string, volume: number, startOffset = 0) {
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fallbackRef = useRef<HTMLAudioElement | null>(null);
  const playbackRequestRef = useRef(0);

  useEffect(() => {
    const fallback = new Audio(src);
    fallback.preload = 'auto';
    fallback.volume = volume;
    fallbackRef.current = fallback;

    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: AudioContextConstructor })
        .webkitAudioContext;
    const context = AudioContextClass ? new AudioContextClass() : null;
    contextRef.current = context;
    const controller = new AbortController();

    if (context) {
      void fetch(src, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`Audio preload failed: ${response.status}`);
          return response.arrayBuffer();
        })
        .then((bytes) => context.decodeAudioData(bytes))
        .then((buffer) => {
          bufferRef.current = buffer;
        })
        .catch(() => undefined);
    }

    return () => {
      playbackRequestRef.current += 1;
      controller.abort();
      sourceRef.current?.stop();
      sourceRef.current = null;
      if (!fallback.paused) fallback.pause();
      fallback.removeAttribute('src');
      fallbackRef.current = null;
      bufferRef.current = null;
      void context?.close();
      contextRef.current = null;
    };
  }, [src, volume]);

  const prime = useCallback(() => {
    const context = contextRef.current;
    if (context?.state === 'suspended') void context.resume();
    const fallback = fallbackRef.current;
    if (fallback && fallback.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) fallback.load();
  }, []);

  const play = useCallback(() => {
    const context = contextRef.current;
    const buffer = bufferRef.current;
    const requestId = ++playbackRequestRef.current;

    const playFallback = () => {
      if (requestId !== playbackRequestRef.current) return;
      const fallback = fallbackRef.current;
      if (!fallback) return;
      fallback.pause();
      fallback.currentTime = startOffset;
      void fallback.play().catch(() => undefined);
    };

    const playBuffer = () => {
      if (
        requestId !== playbackRequestRef.current ||
        !context ||
        !buffer ||
        context.state !== 'running'
      ) {
        playFallback();
        return;
      }

      sourceRef.current?.stop();
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      source.start(0, Math.min(startOffset, Math.max(0, buffer.duration - 0.01)));
      sourceRef.current = source;
    };

    if (context && buffer) {
      if (context.state === 'running') playBuffer();
      else void context.resume().then(playBuffer).catch(playFallback);
      return;
    }

    playFallback();
  }, [startOffset, volume]);

  return { play, prime };
}

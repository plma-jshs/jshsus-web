import type { WakeSongRequestStatus } from './types';

export const WAKE_SONG_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function wakeSongStatusPresentation(status: WakeSongRequestStatus) {
  if (status === 'PENDING') return { label: '대기', tone: 'pending' } as const;
  if (status === 'APPROVED' || status === 'SCHEDULED' || status === 'PLAYED') {
    return { label: '승인', tone: 'approved' } as const;
  }
  if (status === 'CANCELED') return { label: '취소', tone: 'canceled' } as const;
  return { label: '반려', tone: 'rejected' } as const;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function parseDuration(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const numbers = parts.map(Number);
  const [hours, minutes, seconds] =
    numbers.length === 3 ? numbers : ([0, numbers[0], numbers[1]] as number[]);
  if (minutes === undefined || seconds === undefined || hours === undefined) return null;
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function effectiveDuration(startSeconds: number, endSeconds: number, rate: number) {
  if (endSeconds <= startSeconds || rate <= 0) return 0;
  return Math.ceil((endSeconds - startSeconds) / rate);
}

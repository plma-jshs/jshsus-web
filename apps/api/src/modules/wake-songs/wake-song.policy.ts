export const MAX_EFFECTIVE_DURATION_SECONDS = 180;
export const MAX_PENDING_WAKE_SONG_REQUESTS = 3;
export const ALLOWED_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export class WakeSongPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WakeSongPolicyError';
  }
}

export function playbackRateToHundredths(playbackRate: number): number {
  if (!ALLOWED_PLAYBACK_RATES.some((candidate) => candidate === playbackRate)) {
    throw new WakeSongPolicyError('지원하지 않는 재생 속도입니다.');
  }
  return Math.round(playbackRate * 100);
}

export function validateWakeSongSegment(input: {
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  videoDurationSeconds?: number;
}) {
  const { startSeconds, endSeconds, playbackRate, videoDurationSeconds } = input;

  if (!Number.isInteger(startSeconds) || startSeconds < 0) {
    throw new WakeSongPolicyError('시작 시각은 0초 이상의 정수여야 합니다.');
  }
  if (!Number.isInteger(endSeconds) || endSeconds <= startSeconds) {
    throw new WakeSongPolicyError('종료 시각은 시작 시각보다 커야 합니다.');
  }
  if (endSeconds > 86_400) {
    throw new WakeSongPolicyError('종료 시각이 허용 범위를 벗어났습니다.');
  }

  const playbackRateHundredths = playbackRateToHundredths(playbackRate);
  if (videoDurationSeconds !== undefined && endSeconds > videoDurationSeconds) {
    throw new WakeSongPolicyError('종료 시각이 영상 길이를 초과합니다.');
  }

  const effectiveDurationSeconds = Math.ceil((endSeconds - startSeconds) / playbackRate);
  if (effectiveDurationSeconds > MAX_EFFECTIVE_DURATION_SECONDS) {
    throw new WakeSongPolicyError('실제 재생 시간은 최대 3분까지 신청할 수 있습니다.');
  }

  return { playbackRateHundredths, effectiveDurationSeconds };
}

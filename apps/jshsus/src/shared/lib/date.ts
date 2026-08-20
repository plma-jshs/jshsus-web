const KOREA_TIME_ZONE = 'Asia/Seoul';

/**
 * Korean Intl date output includes spaces after every dot (for example
 * `2026. 08. 01.`). Keep the separator compact while preserving a single
 * space before weekday and time labels.
 */
export function compactKoreanDateDots(value: string) {
  return value
    .replace(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})(?:\.(?=\s|$)|(?=\s|$))/g, '$1.$2.$3')
    .replace(/(^|[^\d])(\d{1,2})\.\s*(\d{1,2})(?:\.(?=\s|$)|(?=\s|$))/g, '$1$2.$3')
    .replace(/\s+\(/g, ' (')
    .trim();
}

export function createKoreanDateFormatter(options: Intl.DateTimeFormatOptions) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    ...options,
  });

  return {
    format(value: Date | number) {
      return compactKoreanDateDots(formatter.format(value).replace(/\.$/, ''));
    },
  };
}

const koreanDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KOREA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toKoreanDateKey(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = koreanDateKeyFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const contentDateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KOREA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 게시글 머리말처럼 정확한 시각이 필요한 곳에서 사용하는 24시간제 표기입니다. */
export function formatKoreanContentDateTime(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = contentDateTimeFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}.${values.month}.${values.day} ${values.hour}:${values.minute}`;
}

/** 목록·댓글에서 사용자가 빠르게 시점을 파악하도록 짧은 상대시간을 반환합니다. */
export function formatKoreanRelativeTime(
  value: string | number | Date,
  now: string | number | Date = Date.now(),
) {
  const date = value instanceof Date ? value : new Date(value);
  const reference = now instanceof Date ? now : new Date(now);
  const rawElapsedSeconds = Math.floor((reference.getTime() - date.getTime()) / 1_000);

  // 게시글·댓글 생성 시각은 미래일 수 없다. DB/서버 시계가 조금 앞서거나
  // 고정된 개발 데이터가 현재 시각보다 앞선 경우에도 목록 표기를 깨지 않는다.
  const elapsedSeconds = Math.max(0, rawElapsedSeconds);

  if (elapsedSeconds < 60) return '방금';

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}시간 전`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}일 전`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) return `${elapsedMonths}개월 전`;

  return `${Math.floor(elapsedDays / 365)}년 전`;
}

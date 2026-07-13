const KOREA_TIME_ZONE = 'Asia/Seoul';

export function createKoreanDateFormatter(options: Intl.DateTimeFormatOptions) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    ...options,
  });

  return {
    format(value: Date | number) {
      return formatter.format(value).replace(/\.$/, '');
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

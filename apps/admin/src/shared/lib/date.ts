const KOREA_TIME_ZONE = 'Asia/Seoul';

const currentKoreanYear = () =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: KOREA_TIME_ZONE,
      year: 'numeric',
    }).format(new Date()),
  );

const koreanYear = (date: Date) =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: KOREA_TIME_ZONE,
      year: 'numeric',
    }).format(date),
  );

export function compactKoreanDateDots(value: string) {
  return value
    .replace(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})(?:\.(?=\s|$)|(?=\s|$))/g, '$1.$2.$3')
    .replace(/(^|[^\d])(\d{1,2})\.\s*(\d{1,2})(?:\.(?=\s|$)|(?=\s|$))/g, '$1$2.$3')
    .replace(/\s+\(/g, ' (')
    .trim();
}

export function formatKoreanDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  return compactKoreanDateDots(
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: KOREA_TIME_ZONE,
      ...options,
    })
      .format(date)
      .replace(/\.$/, ''),
  );
}

/**
 * Admin date presentation: omit the year for dates in the current Korean
 * calendar year, while retaining it for dates from another year.
 *
 * Keep this helper for display values only. Date inputs, API payloads and
 * exports should continue to use their explicit machine-readable formats.
 */
export function formatAdminDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit' },
) {
  const date = value instanceof Date ? value : new Date(value);
  const displayOptions: Intl.DateTimeFormatOptions = { ...options };
  delete displayOptions.year;
  if (koreanYear(date) !== currentKoreanYear()) displayOptions.year = 'numeric';
  return formatKoreanDate(date, displayOptions);
}

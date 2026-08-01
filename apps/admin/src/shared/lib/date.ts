const KOREA_TIME_ZONE = 'Asia/Seoul';

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

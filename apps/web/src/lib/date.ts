export function createKoreanDateFormatter(options: Intl.DateTimeFormatOptions) {
  const formatter = new Intl.DateTimeFormat('ko-KR', options);

  return {
    format(value: Date | number) {
      return formatter.format(value).replace(/\.$/, '');
    },
  };
}

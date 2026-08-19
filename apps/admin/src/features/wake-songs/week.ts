const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AdminWakeSongWeek = {
  startDate: string;
  endDate: string;
  label: string;
};

function dateKey(date: Date) {
  return new Date(date.getTime() + KOREA_OFFSET_MS).toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return `${value.slice(5, 7)}.${value.slice(8, 10)}`;
}

/** The candidate week is always the next Monday through Sunday. */
export function getAdminWakeSongWeek(now: Date, offset = 0): AdminWakeSongWeek {
  const korean = new Date(now.getTime() + KOREA_OFFSET_MS);
  const weekday = korean.getUTCDay();
  const daysUntilNextMonday = weekday === 0 ? 1 : 8 - weekday;
  const start = new Date(
    Date.UTC(
      korean.getUTCFullYear(),
      korean.getUTCMonth(),
      korean.getUTCDate() + daysUntilNextMonday + offset * 7,
    ) - KOREA_OFFSET_MS,
  );
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const startDate = dateKey(start);
  const endDate = dateKey(end);
  const firstWeekday = new Date(
    Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1, 1),
  ).getUTCDay();
  const weekOfMonth = Math.ceil((Number(startDate.slice(8, 10)) + firstWeekday) / 7);

  return {
    startDate,
    endDate,
    label: `${Number(startDate.slice(5, 7))}월 ${weekOfMonth}주차 (${displayDate(startDate)} ~ ${displayDate(endDate)})`,
  };
}

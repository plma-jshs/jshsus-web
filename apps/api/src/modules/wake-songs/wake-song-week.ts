const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WakeSongCandidateWeek = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  label: string;
};

function koreanDateKey(date: Date) {
  return new Date(date.getTime() + KOREA_OFFSET_MS).toISOString().slice(0, 10);
}

function displayDate(dateKey: string) {
  const [, month, day] = dateKey.split('-');
  return `${month}. ${day}`;
}

export function getWakeSongCandidateWeek(createdAt: Date): WakeSongCandidateWeek {
  const korean = new Date(createdAt.getTime() + KOREA_OFFSET_MS);
  const weekday = korean.getUTCDay();
  const daysUntilNextMonday = weekday === 0 ? 1 : 8 - weekday;
  const start = new Date(
    Date.UTC(
      korean.getUTCFullYear(),
      korean.getUTCMonth(),
      korean.getUTCDate() + daysUntilNextMonday,
    ) - KOREA_OFFSET_MS,
  );
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const startDate = koreanDateKey(start);
  const endDate = koreanDateKey(end);
  const startDay = Number(startDate.slice(8, 10));
  const firstWeekday = new Date(
    Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1, 1),
  ).getUTCDay();
  const weekOfMonth = Math.ceil((startDay + firstWeekday) / 7);
  const month = Number(startDate.slice(5, 7));

  return {
    start,
    end,
    startDate,
    endDate,
    label: `${month}월 ${weekOfMonth}주차 (${displayDate(startDate)} ~ ${displayDate(endDate)})`,
  };
}

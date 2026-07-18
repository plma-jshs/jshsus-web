export type CalendarDayCell = {
  key: string;
  year: number;
  month: number;
  day: number;
  isCurrentMonth: boolean;
};

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildCalendarDays(year: number, month: number): CalendarDayCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstWeekday));

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setUTCDate(gridStart.getUTCDate() + index);
    const cellYear = current.getUTCFullYear();
    const cellMonth = current.getUTCMonth() + 1;
    const day = current.getUTCDate();

    return {
      key: toDateKey(cellYear, cellMonth, day),
      year: cellYear,
      month: cellMonth,
      day,
      isCurrentMonth: cellYear === year && cellMonth === month,
    };
  });
}

export const activityTimeSlots = [
  { id: 'morning-1', label: '오전 1면학', startsAt: '09:00', endsAt: '10:40', weekday: false },
  { id: 'morning-2', label: '오전 2면학', startsAt: '11:00', endsAt: '12:00', weekday: false },
  { id: 'afternoon-1', label: '오후 1면학', startsAt: '14:00', endsAt: '15:40', weekday: false },
  { id: 'afternoon-2', label: '오후 2면학', startsAt: '16:00', endsAt: '18:00', weekday: false },
  { id: 'evening-1', label: '저녁 1면학', startsAt: '19:10', endsAt: '20:20', weekday: true },
  { id: 'evening-2', label: '저녁 2면학', startsAt: '20:30', endsAt: '21:30', weekday: true },
  { id: 'evening-3', label: '저녁 3면학', startsAt: '21:50', endsAt: '23:30', weekday: true },
] as const;

export type ActivityTimeSlotId = (typeof activityTimeSlots)[number]['id'];

const activityTimeGroups = [
  { prefix: '오전', slotIds: ['morning-1', 'morning-2'] },
  { prefix: '오후', slotIds: ['afternoon-1', 'afternoon-2'] },
  { prefix: '저녁', slotIds: ['evening-1', 'evening-2', 'evening-3'] },
] as const satisfies ReadonlyArray<{
  prefix: string;
  slotIds: readonly ActivityTimeSlotId[];
}>;

export function koreaDateInput(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isWeekendActivityDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return false;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function availableActivityTimeSlots(date: string, includeDaytime = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const showAll = includeDaytime || isWeekendActivityDate(date);
  return activityTimeSlots.filter((slot) => showAll || slot.weekday);
}

export function activitySlotsDateTimes(date: string, slotIds: ActivityTimeSlotId[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const selected = activityTimeSlots.filter((slot) => slotIds.includes(slot.id));
  if (selected.length === 0 || selected.length !== new Set(slotIds).size) return null;

  return {
    startsAt: new Date(`${date}T${selected[0].startsAt}:00+09:00`).toISOString(),
    endsAt: new Date(`${date}T${selected.at(-1)!.endsAt}:00+09:00`).toISOString(),
  };
}

export function activitySlotDateTimes(date: string, slotId: ActivityTimeSlotId) {
  return activitySlotsDateTimes(date, [slotId]);
}

function groupedActivityTimeSlots(slotIds: ActivityTimeSlotId[]) {
  const selectedIds = new Set(slotIds);

  return activityTimeGroups.flatMap((group) => {
    const selected = group.slotIds
      .filter((slotId) => selectedIds.has(slotId))
      .map((slotId) => activityTimeSlots.find((slot) => slot.id === slotId))
      .filter((slot): slot is (typeof activityTimeSlots)[number] => Boolean(slot));

    if (!selected.length) return [];

    if (selected.length !== group.slotIds.length) {
      return selected.map((slot) => ({
        label: slot.label.replace(/^저녁\s*/, ''),
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      }));
    }

    const periodNumbers = selected.map((slot) => slot.label.match(/\d+/)?.[0]).filter(Boolean);
    return [
      {
        label: `${group.prefix === '저녁' ? '' : `${group.prefix} `}${periodNumbers.join('·')}면학`,
        startsAt: selected[0].startsAt,
        endsAt: selected.at(-1)!.endsAt,
      },
    ];
  });
}

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatActivityTimeRange(startsAt: string, endsAt: string) {
  return `${timeFormatter.format(new Date(startsAt))}~${timeFormatter.format(new Date(endsAt))}`;
}

export function formatActivityTimeRanges(
  date: string,
  startsAt: string,
  endsAt: string,
  savedSlotIds?: ActivityTimeSlotId[],
) {
  const slotIds = inferActivityTimeSlotIds(date, startsAt, endsAt, savedSlotIds);
  const ranges = groupedActivityTimeSlots(slotIds).map(
    (group) => `${group.startsAt}~${group.endsAt}`,
  );
  return ranges.length ? ranges.join(', ') : formatActivityTimeRange(startsAt, endsAt);
}

export function formatActivityPeriodLabel(
  date: string,
  startsAt: string,
  endsAt: string,
  savedSlotIds?: ActivityTimeSlotId[],
) {
  const slotIds = inferActivityTimeSlotIds(date, startsAt, endsAt, savedSlotIds);
  if (!slotIds.length) return '직접 입력';
  return groupedActivityTimeSlots(slotIds)
    .map((group) => group.label)
    .join(', ');
}

export function inferActivityTimeSlotIds(
  date: string,
  startsAt: string,
  endsAt: string,
  savedSlotIds?: ActivityTimeSlotId[],
) {
  const allIds = new Set(activityTimeSlots.map((slot) => slot.id));
  const saved = (savedSlotIds ?? []).filter((id) => allIds.has(id));
  if (saved.length) return saved;

  const start = new Date(startsAt).toISOString();
  const end = new Date(endsAt).toISOString();
  const availableSlots = activityTimeSlots;
  for (let startIndex = 0; startIndex < availableSlots.length; startIndex += 1) {
    for (let endIndex = startIndex; endIndex < availableSlots.length; endIndex += 1) {
      const slotIds = availableSlots
        .slice(startIndex, endIndex + 1)
        .map((slot) => slot.id as ActivityTimeSlotId);
      const times = activitySlotsDateTimes(date, slotIds);
      if (times?.startsAt === start && times.endsAt === end) return slotIds;
    }
  }
  const exact = activityTimeSlots.find((slot) => {
    const times = activitySlotDateTimes(date, slot.id);
    return times?.startsAt === start && times.endsAt === end;
  });
  return exact ? [exact.id] : [];
}

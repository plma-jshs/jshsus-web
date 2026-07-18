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

export function koreaDateInput(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function availableActivityTimeSlots(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return [];
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  return activityTimeSlots.filter((slot) => isWeekend || slot.weekday);
}

export function activitySlotDateTimes(date: string, slotId: ActivityTimeSlotId) {
  const slot = activityTimeSlots.find((candidate) => candidate.id === slotId);
  if (!slot || !availableActivityTimeSlots(date).some((candidate) => candidate.id === slotId)) {
    return null;
  }
  return {
    startsAt: new Date(`${date}T${slot.startsAt}:00+09:00`).toISOString(),
    endsAt: new Date(`${date}T${slot.endsAt}:00+09:00`).toISOString(),
  };
}

import { BadRequestException } from '@nestjs/common';
import type { ActivityTimeSlotId } from '@jshsus/types';

export const ACTIVITY_TIME_SLOTS = [
  { id: 'morning-1', label: '오전 1면학', startsAt: '09:00', endsAt: '10:40', weekday: false },
  { id: 'morning-2', label: '오전 2면학', startsAt: '11:00', endsAt: '12:00', weekday: false },
  { id: 'afternoon-1', label: '오후 1면학', startsAt: '14:00', endsAt: '15:40', weekday: false },
  { id: 'afternoon-2', label: '오후 2면학', startsAt: '16:00', endsAt: '18:00', weekday: false },
  { id: 'evening-1', label: '저녁 1면학', startsAt: '19:10', endsAt: '20:20', weekday: true },
  { id: 'evening-2', label: '저녁 2면학', startsAt: '20:30', endsAt: '21:30', weekday: true },
  { id: 'evening-3', label: '저녁 3면학', startsAt: '21:50', endsAt: '23:30', weekday: true },
] as const;

const KOREA_TIME_ZONE = 'Asia/Seoul';

type KoreaDateTimeParts = {
  date: string;
  time: string;
  dayOfWeek: number;
};

function koreaDateTimeParts(value: Date): KoreaDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get('year'));
  const month = Number(values.get('month'));
  const day = Number(values.get('day'));

  return {
    date: `${values.get('year')}-${values.get('month')}-${values.get('day')}`,
    time: `${values.get('hour')}:${values.get('minute')}`,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

export function resolveActivityTimeSlot(startsAt: Date, endsAt: Date) {
  const start = koreaDateTimeParts(startsAt);
  const end = koreaDateTimeParts(endsAt);

  if (start.date !== end.date) return null;
  const slot = ACTIVITY_TIME_SLOTS.find(
    (candidate) => candidate.startsAt === start.time && candidate.endsAt === end.time,
  );
  if (!slot) return null;

  const isWeekend = start.dayOfWeek === 0 || start.dayOfWeek === 6;
  if (!isWeekend && !slot.weekday) return null;
  return slot;
}

function resolveSelectedActivityTimeSlots(
  startsAt: Date,
  endsAt: Date,
  slotIds: ActivityTimeSlotId[],
) {
  const start = koreaDateTimeParts(startsAt);
  const end = koreaDateTimeParts(endsAt);
  if (start.date !== end.date) return null;

  const isWeekend = start.dayOfWeek === 0 || start.dayOfWeek === 6;
  const uniqueIds = [...new Set(slotIds)];
  if (uniqueIds.length === 0 || uniqueIds.length !== slotIds.length) return null;

  const selected = uniqueIds
    .map((id) => ACTIVITY_TIME_SLOTS.find((slot) => slot.id === id))
    .filter((slot): slot is (typeof ACTIVITY_TIME_SLOTS)[number] => Boolean(slot))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  if (
    selected.length !== uniqueIds.length ||
    selected.some((slot) => !isWeekend && !slot.weekday) ||
    selected[0]?.startsAt !== start.time ||
    selected.at(-1)?.endsAt !== end.time
  ) {
    return null;
  }
  return selected;
}

export function assertAllowedActivityTimes(
  startsAt: Date,
  endsAt: Date,
  slotIds?: ActivityTimeSlotId[],
): ActivityTimeSlotId[] {
  if (startsAt >= endsAt) {
    throw new BadRequestException('활동 종료 시간은 시작 시간보다 늦어야 합니다.');
  }
  if (slotIds?.length) {
    const selected = resolveSelectedActivityTimeSlots(startsAt, endsAt, slotIds);
    if (selected) return selected.map((slot) => slot.id);
    throw new BadRequestException('선택한 활동 시간과 시작·종료 시간이 일치하지 않습니다.');
  }

  const slot = resolveActivityTimeSlot(startsAt, endsAt);
  if (!slot) {
    throw new BadRequestException(
      '활동 시간은 선택한 날짜에 이용 가능한 활동 시간과 일치해야 합니다.',
    );
  }
  return [slot.id];
}

export function assertActivityDateIsTodayOrFuture(startsAt: Date) {
  const activityDate = koreaDateTimeParts(startsAt).date;
  const today = koreaDateTimeParts(new Date()).date;
  if (activityDate < today) {
    throw new BadRequestException('활동 날짜는 오늘 이후만 선택할 수 있습니다.');
  }
}

export function assertAllowedActivityTime(startsAt: Date, endsAt: Date) {
  const [slotId] = assertAllowedActivityTimes(startsAt, endsAt);
  return ACTIVITY_TIME_SLOTS.find((slot) => slot.id === slotId)!;
}

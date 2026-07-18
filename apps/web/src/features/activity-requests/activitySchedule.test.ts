import { describe, expect, it } from 'vitest';
import {
  activitySlotDateTimes,
  activitySlotsDateTimes,
  availableActivityTimeSlots,
} from './activitySchedule';

describe('activity schedule options', () => {
  it('shows only evening study periods on weekdays', () => {
    expect(availableActivityTimeSlots('2026-07-15').map((slot) => slot.id)).toEqual([
      'evening-1',
      'evening-2',
      'evening-3',
    ]);
  });

  it('shows all study periods on weekends', () => {
    expect(availableActivityTimeSlots('2026-07-18')).toHaveLength(7);
  });

  it('builds the same Korea-time range accepted by the API', () => {
    expect(activitySlotDateTimes('2026-07-15', 'evening-1')).toEqual({
      startsAt: '2026-07-15T10:10:00.000Z',
      endsAt: '2026-07-15T11:20:00.000Z',
    });
    expect(activitySlotDateTimes('2026-07-15', 'morning-1')).toBeNull();
  });
  it('builds one range while preserving multiple selected periods separately', () => {
    expect(activitySlotsDateTimes('2026-07-15', ['evening-1', 'evening-2', 'evening-3'])).toEqual({
      startsAt: '2026-07-15T10:10:00.000Z',
      endsAt: '2026-07-15T14:30:00.000Z',
    });
  });
});

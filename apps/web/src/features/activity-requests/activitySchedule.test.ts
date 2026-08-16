import { describe, expect, it } from 'vitest';
import {
  activitySlotDateTimes,
  activitySlotsDateTimes,
  availableActivityTimeSlots,
  formatActivityPeriodLabel,
  formatActivityTimeRanges,
} from './activitySchedule';

describe('activity schedule options', () => {
  it('shows only evening study periods on weekdays', () => {
    expect(availableActivityTimeSlots('2026-07-15').map((slot) => slot.id)).toEqual([
      'evening-1',
      'evening-2',
      'evening-3',
    ]);
  });

  it('reveals daytime study periods on weekdays when requested', () => {
    expect(availableActivityTimeSlots('2026-07-15', true)).toHaveLength(7);
  });

  it('shows all study periods on weekends', () => {
    expect(availableActivityTimeSlots('2026-07-18')).toHaveLength(7);
  });

  it('builds the same Korea-time range accepted by the API', () => {
    expect(activitySlotDateTimes('2026-07-15', 'evening-1')).toEqual({
      startsAt: '2026-07-15T10:10:00.000Z',
      endsAt: '2026-07-15T11:20:00.000Z',
    });
    expect(activitySlotDateTimes('2026-07-15', 'morning-1')).toEqual({
      startsAt: '2026-07-15T00:00:00.000Z',
      endsAt: '2026-07-15T01:40:00.000Z',
    });
  });
  it('builds one range while preserving multiple selected periods separately', () => {
    expect(activitySlotsDateTimes('2026-07-15', ['evening-1', 'evening-2', 'evening-3'])).toEqual({
      startsAt: '2026-07-15T10:10:00.000Z',
      endsAt: '2026-07-15T14:30:00.000Z',
    });
  });

  it('groups selected periods into compact period and time ranges', () => {
    expect(
      formatActivityPeriodLabel(
        '2026-07-15',
        '2026-07-15T00:00:00.000Z',
        '2026-07-15T03:00:00.000Z',
        ['morning-1', 'morning-2'],
      ),
    ).toBe('오전 1·2면학');
    expect(
      formatActivityTimeRanges(
        '2026-07-15',
        '2026-07-15T00:00:00.000Z',
        '2026-07-15T03:00:00.000Z',
        ['morning-1', 'morning-2'],
      ),
    ).toBe('09:00~12:00');
  });

  it('groups partial morning and evening selections by study period family', () => {
    expect(
      formatActivityPeriodLabel(
        '2026-07-18',
        '2026-07-18T00:00:00.000Z',
        '2026-07-18T12:00:00.000Z',
        ['morning-1', 'morning-2', 'evening-2'],
      ),
    ).toBe('오전 1·2면학, 2면학');
  });

  it('keeps non-contiguous periods as separate compact ranges', () => {
    expect(
      formatActivityTimeRanges(
        '2026-07-15',
        '2026-07-15T10:10:00.000Z',
        '2026-07-15T14:30:00.000Z',
        ['evening-1', 'evening-3'],
      ),
    ).toBe('19:10~20:20, 21:50~23:30');
  });
});

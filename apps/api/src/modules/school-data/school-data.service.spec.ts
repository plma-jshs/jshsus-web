import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import type { RedisService } from '../redis/redis.service';
import { SchoolDataService } from './school-data.service';

function createService() {
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    setJson: vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;
  return new SchoolDataService({} as DatabaseService, redis);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const fixedNow = new Date('2026-07-12T03:00:00.000Z');

function scheduleRow(index: number) {
  return {
    AA_YMD: '20260720',
    EVENT_NM: `event-${index}`,
    EVENT_CNTNT: '',
    SBTR_DD_SC_NM: '\uD574\uB2F9\uC5C6\uC74C',
  };
}

describe('SchoolDataService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes a NEIS meal and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        mealServiceDietInfo: [
          { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000' } }] },
          {
            row: [
              {
                MMEAL_SC_CODE: '2',
                MMEAL_SC_NM: '중식',
                MLSV_YMD: '20260712',
                DDISH_NM: '백미밥 <br/> 닭구이 (1.2.5.6)',
                CAL_INFO: '800 Kcal',
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();

    const first = await service.getMeals('2026-07-12');
    const second = await service.getMeals('2026-07-12');
    const adjacentDate = await service.getMeals('2026-07-13');

    expect(first).toEqual({
      date: '2026-07-12',
      available: true,
      meals: [
        {
          id: 'neis:meal:20260712:2',
          date: '2026-07-12',
          type: 'lunch',
          typeLabel: '중식',
          dishes: ['백미밥', '닭구이'],
          calories: '800 Kcal',
          source: 'neis',
        },
      ],
    });
    expect(second).toEqual(first);
    expect(adjacentDate).toEqual({ date: '2026-07-13', meals: [], available: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('ATPT_OFCDC_SC_CODE=Q10');
    expect(requestedUrl).toContain('SD_SCHUL_CODE=7140163');
    expect(requestedUrl).toContain('MLSV_FROM_YMD=20260601');
    expect(requestedUrl).toContain('MLSV_TO_YMD=20260831');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Accept: '*/*' } }),
    );
  });

  it('isolates a NEIS outage from the public response', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();

    await expect(service.getMeals('2026-07-12')).resolves.toEqual({
      date: '2026-07-12',
      meals: [],
      available: false,
    });
    await expect(service.getMeals('2026-07-12')).resolves.toMatchObject({ available: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves each source status in the home response', async () => {
    const service = createService();
    vi.spyOn(service, 'getMeals').mockResolvedValue({
      date: '2026-07-12',
      meals: [],
      available: false,
    });
    vi.spyOn(service, 'getCalendar').mockResolvedValue({
      from: '2026-07-01',
      to: '2026-07-31',
      events: [],
      available: true,
      availability: 'partial',
      neisAvailable: false,
      schoolEventsAvailable: true,
    });

    const result = await service.getHomeData(fixedNow);

    expect(result).toMatchObject({
      availability: 'partial',
      mealAvailability: 'unavailable',
      calendarAvailability: 'partial',
      neisCalendarAvailability: 'unavailable',
      schoolEventsAvailability: 'available',
    });
  });

  it('rejects malformed date input before making an external request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();

    await expect(service.getMeals('2026-02-31')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects public dates outside the bounded KST window', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();

    await expect(service.getMeals('2027-07-14', fixedNow)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getCalendar('2026-01-01', '2026-05-01', fixedNow)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('combines validated NEIS and managed school events', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        SchoolSchedule: [
          { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000' } }] },
          {
            row: [
              {
                AA_YMD: '20260720',
                EVENT_NM: '방학식',
                EVENT_CNTNT: '',
                SBTR_DD_SC_NM: '해당없음',
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();
    vi.spyOn(service, 'listManagedEvents').mockResolvedValue([
      {
        id: 1,
        title: '학생회 행사',
        startsAt: '2026-07-21T00:00:00.000Z',
        endsAt: '2026-07-21T23:59:59.999Z',
        allDay: true,
        category: 'student-council',
        isHoliday: false,
        isPublic: true,
      },
    ]);

    const result = await service.getCalendar('2026-07-01', '2026-07-31', fixedNow);

    expect(result.neisAvailable).toBe(true);
    expect(result.schoolEventsAvailable).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.source)).toEqual(['neis', 'school']);
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('AA_FROM_YMD=20260601');
    expect(requestedUrl).toContain('AA_TO_YMD=20260831');
  });

  it('returns a unified admin calendar while keeping NEIS read-only and private school events visible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          SchoolSchedule: [
            { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000' } }] },
            {
              row: [
                {
                  AA_YMD: '20260720',
                  EVENT_NM: 'NEIS 일정',
                  EVENT_CNTNT: '',
                  SBTR_DD_SC_NM: '해당없음',
                },
              ],
            },
          ],
        }),
      ),
    );
    const service = createService();
    vi.spyOn(service, 'listManagedEvents').mockResolvedValue([
      {
        id: 9,
        title: '내부 검토 일정',
        startsAt: '2026-07-21T00:00:00.000Z',
        endsAt: '2026-07-21T23:59:59.999Z',
        allDay: true,
        category: 'school',
        isHoliday: false,
        isPublic: false,
      },
    ]);

    const result = await service.getAdminCalendar('2026-07-01', '2026-07-31');

    expect(result.events).toHaveLength(2);
    expect(result.events.find((event) => event.source === 'neis')).toMatchObject({
      title: 'NEIS 일정',
      editable: false,
      isPublic: true,
    });
    expect(result.events.find((event) => event.source === 'school')).toMatchObject({
      id: 'school:9',
      managedId: 9,
      title: '내부 검토 일정',
      editable: true,
      isPublic: false,
    });
  });

  it('paginates NEIS schedules and verifies the complete row count', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const page = Number(new URL(String(input)).searchParams.get('pIndex'));
      const rows =
        page === 1
          ? Array.from({ length: 100 }, (_, index) => scheduleRow(index))
          : [scheduleRow(100)];
      return Promise.resolve(
        jsonResponse({
          SchoolSchedule: [
            { head: [{ list_total_count: 101 }, { RESULT: { CODE: 'INFO-000' } }] },
            { row: rows },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();
    vi.spyOn(service, 'listManagedEvents').mockResolvedValue([]);

    const result = await service.getCalendar('2026-07-01', '2026-07-31', fixedNow);

    expect(result.events).toHaveLength(101);
    expect(result.availability).toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('pIndex=2');
  });

  it('reports a partial result instead of silently truncating beyond the NEIS safety cap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          SchoolSchedule: [
            { head: [{ list_total_count: 501 }, { RESULT: { CODE: 'INFO-000' } }] },
            { row: [] },
          ],
        }),
      ),
    );
    const service = createService();
    vi.spyOn(service, 'listManagedEvents').mockResolvedValue([]);

    const result = await service.getCalendar('2026-07-01', '2026-07-31', fixedNow);

    expect(result.events).toEqual([]);
    expect(result.neisAvailable).toBe(false);
    expect(result.schoolEventsAvailable).toBe(true);
    expect(result.availability).toBe('partial');
  });

  it('keeps the in-process LRU cache bounded across distinct valid dates', async () => {
    const service = createService();
    const internal = service as unknown as {
      memoryCache: Map<string, unknown>;
      remember: (key: string, value: unknown) => void;
    };

    for (let index = 0; index < 140; index += 1) {
      internal.remember(`test:${index}`, []);
    }

    expect(internal.memoryCache.size).toBe(128);
  });

  it('keeps the failure backoff map bounded across distinct failed requests', async () => {
    const service = createService();
    const internal = service as unknown as {
      failureUntil: Map<string, unknown>;
      recordFailure: (key: string, until: number) => void;
    };

    for (let index = 0; index < 140; index += 1) {
      internal.recordFailure(`test:${index}`, Date.now() + 60_000);
    }

    expect(internal.failureUntil.size).toBe(128);
  });
});

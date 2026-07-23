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

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html;charset=UTF-8' },
  });
}

const fixedNow = new Date('2026-07-12T03:00:00.000Z');

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
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
      homepageAvailable: false,
      schoolEventsAvailable: true,
    });

    const result = await service.getHomeData(fixedNow);

    expect(result).toMatchObject({
      availability: 'partial',
      mealAvailability: 'unavailable',
      calendarAvailability: 'partial',
      homepageCalendarAvailability: 'unavailable',
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

  it('combines homepage calendar events and managed school events', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        htmlResponse(`
        <input type="hidden" id="selectYearMonth" name="selectYearMonth" value="202607" />
        <table>
          <tbody>
            <tr>
              <td class="selectDay" id="20260720">
                <p class="calLink btnInfo" data-seq="closing" data-schdulTitle="방학식">
                  <a>방학식</a>
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      `),
      ),
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

    expect(result.homepageAvailable).toBe(true);
    expect(result.schoolEventsAvailable).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.source)).toEqual(['school', 'school']);
    const requestedUrls = fetchUrls(fetchMock);
    expect(requestedUrls.every((url) => !url.includes('/hub/SchoolSchedule'))).toBe(true);
    expect(requestedUrls[0]).toContain('mi=52322');
    expect(requestedUrls[0]).toContain('selectYearMonth=202606');
  });

  it('prefers the school homepage calendar and expands homepage range hints', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        htmlResponse(`
        <input type="hidden" id="selectYearMonth" name="selectYearMonth" value="202607" />
        <table>
          <tbody>
            <tr>
              <td class="selectDay" id="20260717">
                <p class="calLink "><a><span>&nbsp;&nbsp;· 제헌절</span></a></p>
              </td>
              <td class="selectDay" id="20260718">
                <p class="calLink" style="background-color:#FF0000;">
                  <span style="color:#fff">&nbsp;&nbsp;· 토요휴업일</span>
                </p>
              </td>
              <td class="selectDay" id="20260721">
                <p class="calLink btnInfo" data-seq="summer-1" data-schdulTitle="방과후 수업 시작 1차(~24일)">
                  <a>방과후 수업 시작 1차(~24일)</a>
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      `),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();
    vi.spyOn(service, 'listManagedEvents').mockResolvedValue([]);

    const result = await service.getCalendar('2026-07-01', '2026-07-31', fixedNow);

    expect(result.homepageAvailable).toBe(true);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '방과후 수업 시작 1차',
          startsAt: '2026-07-21T00:00:00.000+09:00',
          endsAt: '2026-07-24T23:59:59.999+09:00',
          isHoliday: false,
          source: 'school',
        }),
        expect.objectContaining({
          title: '제헌절',
          category: 'observance',
          isHoliday: false,
          source: 'school',
        }),
        expect.objectContaining({
          title: '토요휴업일',
          category: 'holiday',
          isHoliday: true,
          source: 'school',
        }),
      ]),
    );
    expect(
      fetchUrls(fetchMock).filter((url) => url.includes('schdulCalendarView.do')),
    ).toHaveLength(3);
  });

  it('returns a unified admin calendar while keeping homepage events read-only and private school events visible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          htmlResponse(`
          <input type="hidden" id="selectYearMonth" name="selectYearMonth" value="202607" />
          <table>
            <tbody>
              <tr>
                <td class="selectDay" id="20260720">
                  <p class="calLink btnInfo" data-seq="homepage-1" data-schdulTitle="홈페이지 일정">
                    <a>홈페이지 일정</a>
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        `),
        ),
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
    expect(result.events.find((event) => event.id === 'school-homepage:homepage-1')).toMatchObject({
      title: '홈페이지 일정',
      editable: false,
      isPublic: true,
    });
    expect(result.events.find((event) => event.id === 'school:9')).toMatchObject({
      id: 'school:9',
      managedId: 9,
      title: '내부 검토 일정',
      editable: true,
      isPublic: false,
    });
  });

  it('uses the bundled homepage snapshot instead of NEIS schedules when live homepage access is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('homepage unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();
    vi.spyOn(service, 'listManagedEvents').mockResolvedValue([]);

    const result = await service.getCalendar('2026-07-01', '2026-07-31', fixedNow);

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '방과후 수업 시작 1차',
          startsAt: '2026-07-21T00:00:00.000+09:00',
          endsAt: '2026-07-24T23:59:59.999+09:00',
          source: 'school',
        }),
      ]),
    );
    expect(result.homepageAvailable).toBe(true);
    expect(result.schoolEventsAvailable).toBe(true);
    expect(result.availability).toBe('available');
    const requestedUrls = fetchUrls(fetchMock);
    expect(requestedUrls.every((url) => !url.includes('/hub/SchoolSchedule'))).toBe(true);
  });

  it('accepts homepage calendar months with no event links', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        htmlResponse(`
          <input type="hidden" id="selectYearMonth" name="selectYearMonth" value="202609" />
          <table>
            <tbody>
              <tr><td class="selectDay" id="20260901"></td></tr>
            </tbody>
          </table>
        `),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();
    vi.spyOn(service, 'listManagedEvents').mockResolvedValue([]);

    const result = await service.getCalendar('2026-09-01', '2026-09-30', fixedNow);

    expect(result.events).toEqual([]);
    expect(result.homepageAvailable).toBe(true);
    expect(result.availability).toBe('available');
    expect(fetchUrls(fetchMock).every((url) => !url.includes('/hub/SchoolSchedule'))).toBe(true);
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

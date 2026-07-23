import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  AcademicEvent,
  ManagedSchoolEvent,
  SchoolDataAvailability,
  SchoolDataSourceAvailability,
  SchoolMeal,
  SchoolMealType,
} from '@jshsus/types';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../shared/config/env';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

const NEIS_BASE_URL = 'https://open.neis.go.kr/hub';
const SCHOOL_HOMEPAGE_CALENDAR_URL =
  'https://jeonnam-sh.jge.hs.kr/chonnam-sh_hs/schl/sv/schdulView/schdulCalendarView.do';
const KOREA_TIME_ZONE = 'Asia/Seoul';
const MAX_MANAGED_RANGE_DAYS = 366;
const MAX_PUBLIC_RANGE_DAYS = 93;
const PUBLIC_PAST_DAYS = 366;
const PUBLIC_FUTURE_DAYS = 366;
const NEIS_PAGE_SIZE = 100;
const MAX_NEIS_MEAL_ROWS = 300;
const MAX_MEMORY_CACHE_ENTRIES = 128;
const MAX_FAILURE_ENTRIES = 128;
const MAX_IN_FLIGHT_LOADS = 16;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.')
  .refine(isValidCalendarDate, 'Date must be a real calendar date.');
const compactDateSchema = z
  .string()
  .regex(/^\d{8}$/)
  .refine((value) => isValidCalendarDate(fromCompactDate(value)));
const dateRangeSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .superRefine((range, context) => {
    const from = startOfKoreanDay(range.from);
    const to = endOfKoreanDay(range.to);

    if (!from || !to || from > to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'The end date must not be earlier than the start date.',
      });
      return;
    }

    if (inclusiveDayCount(range.from, range.to) > MAX_MANAGED_RANGE_DAYS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `The requested range must not exceed ${MAX_MANAGED_RANGE_DAYS} days.`,
      });
    }
  });

const eventDateTimeSchema = z
  .string()
  .trim()
  .refine((value) => parseEventDate(value) !== null, 'Date must be ISO 8601 or YYYY-MM-DD.');

const managedEventSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5000).optional().default(''),
    category: z.string().trim().min(1).max(40).optional().default('school'),
    startsAt: eventDateTimeSchema,
    endsAt: eventDateTimeSchema,
    allDay: z.boolean().optional().default(true),
    isHoliday: z.boolean().optional().default(false),
    isPublic: z.boolean().optional().default(true),
  })
  .superRefine((event, context) => {
    const startsAt = parseEventDate(event.startsAt);
    const endsAt = parseEventDate(event.endsAt, true);
    if (startsAt && endsAt && startsAt > endsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'The event end must not be earlier than its start.',
      });
    }
  });

const neisMealRowSchema = z.object({
  MMEAL_SC_CODE: z.string(),
  MMEAL_SC_NM: z.string(),
  MLSV_YMD: compactDateSchema,
  DDISH_NM: z.string(),
  CAL_INFO: z.string().optional(),
});

const schoolMealCacheSchema = z.array(
  z.object({
    id: z.string(),
    date: dateSchema,
    type: z.enum(['breakfast', 'lunch', 'dinner', 'other']),
    typeLabel: z.string(),
    dishes: z.array(z.string()),
    calories: z.string().optional(),
    source: z.literal('neis'),
  }),
);

const academicEventCacheSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    allDay: z.boolean(),
    description: z.string().optional(),
    category: z.string(),
    isHoliday: z.boolean(),
    source: z.literal('school'),
  }),
);

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  staleUntil: number;
};

type LoadResult<T> = {
  value: T;
  available: boolean;
};

type NeisPage<T> = {
  rows: T[];
  totalCount: number;
};

export type HomeSchoolData = {
  mealDate: string;
  scheduleFrom: string;
  scheduleTo: string;
  meals: SchoolMeal[];
  academicEvents: AcademicEvent[];
  availability: SchoolDataAvailability;
  mealAvailability: SchoolDataSourceAvailability;
  calendarAvailability: SchoolDataAvailability;
  homepageCalendarAvailability: SchoolDataSourceAvailability;
  schoolEventsAvailability: SchoolDataSourceAvailability;
};

export type AdminSchoolCalendarEvent = AcademicEvent & {
  managedId?: number;
  editable: boolean;
  isPublic: boolean;
};

export type AdminSchoolCalendar = {
  from: string;
  to: string;
  events: AdminSchoolCalendarEvent[];
  availability: SchoolDataAvailability;
  homepageAvailable: boolean;
  schoolEventsAvailable: boolean;
};

function startOfKoreanDay(value: string): Date | null {
  if (!isValidCalendarDate(value)) return null;
  const date = new Date(`${value}T00:00:00.000+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfKoreanDay(value: string): Date | null {
  if (!isValidCalendarDate(value)) return null;
  const date = new Date(`${value}T23:59:59.999+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseEventDate(value: string, endOfDay = false): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return endOfDay ? endOfKoreanDay(value) : startOfKoreanDay(value);
  }

  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function formatKoreanDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function inclusiveDayCount(from: string, to: string): number {
  const fromDate = startOfKoreanDay(from);
  const toDate = startOfKoreanDay(to);
  if (!fromDate || !toDate) return Number.POSITIVE_INFINITY;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
}

function shiftCalendarDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function assertPublicDateWindow(date: string, now: Date): void {
  const today = formatKoreanDate(now);
  const earliest = shiftCalendarDate(today, -PUBLIC_PAST_DAYS);
  const latest = shiftCalendarDate(today, PUBLIC_FUTURE_DAYS);
  if (date < earliest || date > latest) {
    throw new BadRequestException(`The requested date must be between ${earliest} and ${latest}.`);
  }
}

function assertPublicCalendarWindow(from: string, to: string, now: Date): void {
  assertPublicDateWindow(from, now);
  assertPublicDateWindow(to, now);
  if (inclusiveDayCount(from, to) > MAX_PUBLIC_RANGE_DAYS) {
    throw new BadRequestException(
      `The requested public calendar range must not exceed ${MAX_PUBLIC_RANGE_DAYS} days.`,
    );
  }
}

function monthRange(date: string): { from: string; to: string } {
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01`,
    to: `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`,
  };
}

function adjacentMonthRange(from: string, to = from): { from: string; to: string } {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  const previousMonth = new Date(Date.UTC(fromYear, fromMonth - 2, 1));
  const nextMonthLastDay = new Date(Date.UTC(toYear, toMonth + 1, 0));

  return {
    from: `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}-01`,
    to: nextMonthLastDay.toISOString().slice(0, 10),
  };
}

function toCompactDate(date: string): string {
  return date.replaceAll('-', '');
}

function fromCompactDate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function decodeBasicEntities(value: string): string {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value: string): string {
  return decodeBasicEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/^\s*·\s*/, '')
    .trim();
}

function extractHtmlAttribute(value: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(value);
  const raw = match?.[2] ?? match?.[3] ?? match?.[4];
  return raw ? decodeBasicEntities(raw) : undefined;
}

function hasRedBackgroundStyle(attributes: string): boolean {
  const style = extractHtmlAttribute(attributes, 'style')?.replace(/\s+/g, '').toLowerCase() ?? '';
  return /background(?:-color)?:#?(?:f00|ff0000)\b/.test(style);
}

function normalizeSchoolHomepageTitle(value: string): string {
  return decodeBasicEntities(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s*[(（]\s*~\s*\d{1,2}\s*일\s*[)）]\s*$/, '')
    .replace(/^\s*·\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSchoolHomepageEndDate(title: string, startsAt: string): string {
  const rangeMatch = /[(（]\s*~\s*(\d{1,2})\s*일\s*[)）]/.exec(title);
  if (!rangeMatch) return startsAt;
  const [year, month, day] = startsAt.split('-').map(Number);
  const endDay = Number(rangeMatch[1]);
  const endMonthOffset = endDay < day ? 1 : 0;
  const endDate = new Date(Date.UTC(year, month - 1 + endMonthOffset, endDay));
  return endDate.toISOString().slice(0, 10);
}

function monthKeysBetween(from: string, to: string): string[] {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  const current = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
  const end = new Date(Date.UTC(toYear, toMonth - 1, 1));
  const keys: string[] = [];
  while (current <= end) {
    keys.push(
      `${String(current.getUTCFullYear()).padStart(4, '0')}${String(
        current.getUTCMonth() + 1,
      ).padStart(2, '0')}`,
    );
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return keys;
}

function parseDishes(value: string): string[] {
  return value
    .split(/<br\s*\/?\s*>/i)
    .map((dish) => decodeBasicEntities(dish.replace(/<[^>]*>/g, '')))
    .map((dish) => dish.replace(/\s*\([0-9.]+\)\s*$/, '').trim())
    .filter(Boolean);
}

function mealType(code: string): SchoolMealType {
  if (code === '1') return 'breakfast';
  if (code === '2') return 'lunch';
  if (code === '3') return 'dinner';
  return 'other';
}

function availability(results: boolean[]): SchoolDataAvailability {
  const availableCount = results.filter(Boolean).length;
  if (availableCount === results.length) return 'available';
  if (availableCount > 0) return 'partial';
  return 'unavailable';
}

@Injectable()
export class SchoolDataService {
  private readonly logger = new Logger(SchoolDataService.name);
  private readonly memoryCache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly failureUntil = new Map<string, number>();

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async getHomeData(now = new Date()): Promise<HomeSchoolData> {
    const mealDate = formatKoreanDate(now);
    const range = monthRange(mealDate);
    const [meals, calendar] = await Promise.all([
      this.getMeals(mealDate, now),
      this.getCalendar(range.from, range.to, now),
    ]);

    return {
      mealDate,
      scheduleFrom: range.from,
      scheduleTo: range.to,
      meals: meals.meals,
      academicEvents: calendar.events,
      availability: availability([
        meals.available,
        calendar.homepageAvailable,
        calendar.schoolEventsAvailable,
      ]),
      mealAvailability: meals.available ? 'available' : 'unavailable',
      calendarAvailability: calendar.availability,
      homepageCalendarAvailability: calendar.homepageAvailable ? 'available' : 'unavailable',
      schoolEventsAvailability: calendar.schoolEventsAvailable ? 'available' : 'unavailable',
    };
  }

  async getMeals(
    inputDate?: string,
    now = new Date(),
  ): Promise<{
    date: string;
    meals: SchoolMeal[];
    available: boolean;
  }> {
    const parsed = dateSchema.safeParse(inputDate ?? formatKoreanDate(now));
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    if (!startOfKoreanDay(parsed.data)) throw new BadRequestException('Invalid date.');

    const date = parsed.data;
    assertPublicDateWindow(date, now);
    const cacheRange = adjacentMonthRange(date);
    const result = await this.cachedLoad<SchoolMeal[]>(
      `neis:meals:${env.NEIS_ATPT_OFCDC_SC_CODE}:${env.NEIS_SD_SCHUL_CODE}:${cacheRange.from}:${cacheRange.to}`,
      () => this.loadNeisMeals(cacheRange.from, cacheRange.to),
      (value): value is SchoolMeal[] => schoolMealCacheSchema.safeParse(value).success,
      [],
    );
    return {
      date,
      meals: result.value.filter((meal) => meal.date === date),
      available: result.available,
    };
  }

  async getCalendar(
    inputFrom?: string,
    inputTo?: string,
    now = new Date(),
  ): Promise<{
    from: string;
    to: string;
    events: AcademicEvent[];
    available: boolean;
    availability: SchoolDataAvailability;
    homepageAvailable: boolean;
    schoolEventsAvailable: boolean;
  }> {
    const today = formatKoreanDate(now);
    const defaults = monthRange(today);
    const parsed = dateRangeSchema.safeParse({
      from: inputFrom ?? defaults.from,
      to: inputTo ?? defaults.to,
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const { from, to } = parsed.data;
    assertPublicCalendarWindow(from, to, now);
    const cacheRange = adjacentMonthRange(from, to);
    const [homepage, custom] = await Promise.all([
      this.cachedLoad<AcademicEvent[]>(
        `school-homepage:calendar:${cacheRange.from}:${cacheRange.to}`,
        () => this.loadSchoolHomepageCalendar(cacheRange.from, cacheRange.to),
        (value): value is AcademicEvent[] => academicEventCacheSchema.safeParse(value).success,
        [],
      ),
      this.safeListManagedEvents(from, to, false),
    ]);
    const externalCalendar = homepage;

    const visibleExternalEvents = externalCalendar.value.filter(
      (event) =>
        formatKoreanDate(new Date(event.startsAt)) <= to &&
        formatKoreanDate(new Date(event.endsAt)) >= from,
    );
    const events = [...visibleExternalEvents, ...custom.value].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    );
    return {
      from,
      to,
      events,
      available: externalCalendar.available || custom.available,
      availability: availability([externalCalendar.available, custom.available]),
      homepageAvailable: externalCalendar.available,
      schoolEventsAvailable: custom.available,
    };
  }

  async getAdminCalendar(inputFrom?: string, inputTo?: string): Promise<AdminSchoolCalendar> {
    const today = formatKoreanDate();
    const defaults = monthRange(today);
    const parsed = dateRangeSchema.safeParse({
      from: inputFrom ?? defaults.from,
      to: inputTo ?? defaults.to,
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const { from, to } = parsed.data;
    const cacheRange = adjacentMonthRange(from, to);
    const [homepage, custom] = await Promise.all([
      this.cachedLoad<AcademicEvent[]>(
        `school-homepage:calendar:${cacheRange.from}:${cacheRange.to}`,
        () => this.loadSchoolHomepageCalendar(cacheRange.from, cacheRange.to),
        (value): value is AcademicEvent[] => academicEventCacheSchema.safeParse(value).success,
        [],
      ),
      this.safeListRawManagedEvents(from, to, true),
    ]);
    const externalCalendar = homepage;

    const visibleExternalEvents = externalCalendar.value.filter(
      (event) =>
        formatKoreanDate(new Date(event.startsAt)) <= to &&
        formatKoreanDate(new Date(event.endsAt)) >= from,
    );
    const events: AdminSchoolCalendarEvent[] = [
      ...visibleExternalEvents.map((event) => ({
        ...event,
        editable: false,
        isPublic: true,
      })),
      ...custom.value.map((event) => ({
        id: `school:${event.id}`,
        managedId: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        description: event.description,
        category: event.category,
        isHoliday: event.isHoliday,
        source: 'school' as const,
        editable: true,
        isPublic: event.isPublic,
      })),
    ].sort((left, right) =>
      left.startsAt === right.startsAt
        ? left.title.localeCompare(right.title, 'ko')
        : left.startsAt.localeCompare(right.startsAt),
    );

    return {
      from,
      to,
      events,
      availability: availability([externalCalendar.available, custom.available]),
      homepageAvailable: externalCalendar.available,
      schoolEventsAvailable: custom.available,
    };
  }

  async listManagedEvents(
    inputFrom?: string,
    inputTo?: string,
    includePrivate = false,
  ): Promise<ManagedSchoolEvent[]> {
    const today = formatKoreanDate();
    const defaults = monthRange(today);
    const parsed = dateRangeSchema.safeParse({
      from: inputFrom ?? defaults.from,
      to: inputTo ?? defaults.to,
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const startsAt = startOfKoreanDay(parsed.data.from)!;
    const endsAt = endOfKoreanDay(parsed.data.to)!;
    return this.database.query('school-events.list', async (db) => {
      const rows = await db
        .select()
        .from(schema.schoolEvents)
        .where(
          and(
            lte(schema.schoolEvents.startsAt, endsAt),
            gte(schema.schoolEvents.endsAt, startsAt),
            includePrivate ? undefined : eq(schema.schoolEvents.isPublic, true),
          ),
        )
        .orderBy(asc(schema.schoolEvents.startsAt), asc(schema.schoolEvents.id));
      return rows.map((row) => this.toManagedEvent(row));
    });
  }

  async createManagedEvent(body: unknown, actorId?: number | null): Promise<ManagedSchoolEvent> {
    const parsed = managedEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const values = this.toEventValues(parsed.data);
    const [result] = await this.database.db
      .insert(schema.schoolEvents)
      .values({ ...values, createdById: actorId && actorId > 0 ? actorId : null })
      .$returningId();
    await this.database.writeAudit({
      actorId,
      action: 'school-event.create',
      targetType: 'school_events',
      targetId: result.id,
    });

    return { id: result.id, ...this.toAcademicEvent(values), isPublic: values.isPublic };
  }

  async updateManagedEvent(
    id: number,
    body: unknown,
    actorId?: number | null,
  ): Promise<ManagedSchoolEvent> {
    const existing = await this.findManagedEvent(id);
    const merged = {
      title: existing.title,
      description: existing.description ?? '',
      category: existing.category,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
      allDay: existing.allDay,
      isHoliday: existing.isHoliday,
      isPublic: existing.isPublic,
      ...(typeof body === 'object' && body !== null ? body : {}),
    };
    const parsed = managedEventSchema.safeParse(merged);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const values = this.toEventValues(parsed.data);
    await this.database.db
      .update(schema.schoolEvents)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.schoolEvents.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'school-event.update',
      targetType: 'school_events',
      targetId: id,
    });
    return { id, ...this.toAcademicEvent(values), isPublic: values.isPublic };
  }

  async deleteManagedEvent(id: number, actorId?: number | null): Promise<{ ok: true; id: number }> {
    await this.findManagedEvent(id);
    await this.database.db.delete(schema.schoolEvents).where(eq(schema.schoolEvents.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'school-event.delete',
      targetType: 'school_events',
      targetId: id,
    });
    return { ok: true, id };
  }

  private async findManagedEvent(id: number): Promise<ManagedSchoolEvent> {
    const [row] = await this.database.db
      .select()
      .from(schema.schoolEvents)
      .where(eq(schema.schoolEvents.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('School event not found.');
    return this.toManagedEvent(row);
  }

  private async safeListManagedEvents(
    from: string,
    to: string,
    includePrivate: boolean,
  ): Promise<LoadResult<AcademicEvent[]>> {
    try {
      const events = await this.listManagedEvents(from, to, includePrivate);
      return {
        value: events.map(({ isPublic: _isPublic, ...event }) => ({
          ...event,
          id: `school:${event.id}`,
          source: 'school' as const,
        })),
        available: true,
      };
    } catch (error) {
      this.logger.warn(`School event lookup unavailable: ${this.safeError(error)}`);
      return { value: [], available: false };
    }
  }

  private async safeListRawManagedEvents(
    from: string,
    to: string,
    includePrivate: boolean,
  ): Promise<LoadResult<ManagedSchoolEvent[]>> {
    try {
      return {
        value: await this.listManagedEvents(from, to, includePrivate),
        available: true,
      };
    } catch (error) {
      this.logger.warn(`School event lookup unavailable: ${this.safeError(error)}`);
      return { value: [], available: false };
    }
  }

  private async loadNeisMeals(from: string, to: string): Promise<SchoolMeal[]> {
    const rows = await this.requestAllNeisRows(
      'mealServiceDietInfo',
      {
        MLSV_FROM_YMD: toCompactDate(from),
        MLSV_TO_YMD: toCompactDate(to),
      },
      neisMealRowSchema,
      MAX_NEIS_MEAL_ROWS,
    );
    return rows.map((row) => ({
      id: `neis:meal:${row.MLSV_YMD}:${row.MMEAL_SC_CODE}`,
      date: fromCompactDate(row.MLSV_YMD),
      type: mealType(row.MMEAL_SC_CODE),
      typeLabel: row.MMEAL_SC_NM,
      dishes: parseDishes(row.DDISH_NM),
      calories: row.CAL_INFO?.trim() || undefined,
      source: 'neis' as const,
    }));
  }

  private async loadSchoolHomepageCalendar(from: string, to: string): Promise<AcademicEvent[]> {
    const loadedPages = await Promise.all(
      monthKeysBetween(from, to).map(async (yearMonth) => {
        try {
          return { html: await this.requestSchoolHomepageCalendar(yearMonth), yearMonth };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`School homepage calendar ${yearMonth} could not be loaded: ${message}`);
          return null;
        }
      }),
    );
    const htmlPages = loadedPages.filter(
      (page): page is { html: string; yearMonth: string } => page !== null,
    );
    if (htmlPages.length === 0) {
      throw new Error('School homepage calendar could not be loaded for any requested month.');
    }
    const eventsById = new Map<string, AcademicEvent>();
    for (const page of htmlPages) {
      for (const event of this.parseSchoolHomepageCalendar(page.html)) {
        const startsAt = formatKoreanDate(new Date(event.startsAt));
        const endsAt = formatKoreanDate(new Date(event.endsAt));
        if (startsAt > to || endsAt < from) continue;
        eventsById.set(event.id, event);
      }
    }
    return [...eventsById.values()].sort((left, right) =>
      left.startsAt === right.startsAt
        ? left.title.localeCompare(right.title, 'ko-KR')
        : left.startsAt.localeCompare(right.startsAt),
    );
  }

  private async requestSchoolHomepageCalendar(yearMonth: string): Promise<string> {
    const parameters = new URLSearchParams({
      selectYearMonth: yearMonth,
      selectType: 'haksa',
      sysId: 'chonnam-sh_hs',
    });
    const response = await fetch(`${SCHOOL_HOMEPAGE_CALENDAR_URL}?${parameters.toString()}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'jshsus-calendar-sync/1.0',
      },
      signal: AbortSignal.timeout(env.SCHOOL_DATA_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`School homepage returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.toLowerCase().includes('text/html')) {
      throw new Error(`School homepage returned ${contentType}.`);
    }
    const html = await response.text();
    if (!html.includes('selectYearMonth') || !html.includes('calLink')) {
      throw new Error('School homepage calendar markup was not found.');
    }
    return html;
  }

  private parseSchoolHomepageCalendar(html: string): AcademicEvent[] {
    const groupedEvents = new Map<
      string,
      {
        category: string;
        endsAt: string;
        id: string;
        isHoliday: boolean;
        startsAt: string;
        title: string;
      }
    >();
    const cellRegex = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(html))) {
      const dateId = extractHtmlAttribute(cellMatch[1], 'id');
      if (!dateId || !/^\d{8}$/.test(dateId)) continue;
      const date = fromCompactDate(dateId);
      const cellHtml = cellMatch[2];
      const eventRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
      let eventMatch: RegExpExecArray | null;
      while ((eventMatch = eventRegex.exec(cellHtml))) {
        const attributes = eventMatch[1];
        const className = extractHtmlAttribute(attributes, 'class') ?? '';
        if (!className.split(/\s+/).includes('calLink')) continue;
        const rawTitle =
          extractHtmlAttribute(attributes, 'data-schdulTitle') ?? stripHtml(eventMatch[2]);
        const title = normalizeSchoolHomepageTitle(rawTitle);
        if (!title) continue;
        const seq = extractHtmlAttribute(attributes, 'data-seq');
        const isManagedLink = className.split(/\s+/).includes('btnInfo');
        const isHoliday = !isManagedLink && hasRedBackgroundStyle(attributes);
        const startDate = date;
        const endDate = inferSchoolHomepageEndDate(rawTitle, date);
        const key = seq ? `seq:${seq}:${title}` : `date:${date}:${title}`;
        const previous = groupedEvents.get(key);
        groupedEvents.set(key, {
          category: isHoliday ? 'holiday' : isManagedLink ? 'academic' : 'observance',
          endsAt: previous?.endsAt && previous.endsAt > endDate ? previous.endsAt : endDate,
          id: seq ? `school-homepage:${seq}` : `school-homepage:${dateId}:${title}`,
          isHoliday,
          startsAt:
            previous?.startsAt && previous.startsAt < startDate ? previous.startsAt : startDate,
          title,
        });
      }
    }

    return [...groupedEvents.values()].map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: `${event.startsAt}T00:00:00.000+09:00`,
      endsAt: `${event.endsAt}T23:59:59.999+09:00`,
      allDay: true,
      category: event.category,
      isHoliday: event.isHoliday,
      source: 'school' as const,
    }));
  }

  private async requestNeisMeal(
    requestParameters: Record<string, string>,
    pageIndex: number,
  ): Promise<unknown> {
    const parameters = new URLSearchParams({
      Type: 'json',
      pIndex: String(pageIndex),
      pSize: String(NEIS_PAGE_SIZE),
      ATPT_OFCDC_SC_CODE: env.NEIS_ATPT_OFCDC_SC_CODE,
      SD_SCHUL_CODE: env.NEIS_SD_SCHUL_CODE,
      ...requestParameters,
    });
    if (env.NEIS_API_KEY) parameters.set('KEY', env.NEIS_API_KEY);

    const response = await fetch(`${NEIS_BASE_URL}/mealServiceDietInfo?${parameters.toString()}`, {
      // NEIS meal API returns the requested JSON reliably with wildcard negotiation.
      headers: { Accept: '*/*' },
      signal: AbortSignal.timeout(env.NEIS_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`NEIS meal API returned HTTP ${response.status}.`);
    return response.json();
  }

  private async requestAllNeisRows<T>(
    name: 'mealServiceDietInfo',
    requestParameters: Record<string, string>,
    rowSchema: z.ZodType<T>,
    maxRows: number,
  ): Promise<T[]> {
    const firstPayload = await this.requestNeisMeal(requestParameters, 1);
    const firstPage = this.extractNeisPage(firstPayload, name, rowSchema);
    if (firstPage.totalCount > maxRows) {
      throw new Error(`NEIS ${name} result exceeds the ${maxRows}-row safety limit.`);
    }

    const pageCount = Math.ceil(firstPage.totalCount / NEIS_PAGE_SIZE);
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
        this.requestNeisMeal(requestParameters, index + 2).then((payload) =>
          this.extractNeisPage(payload, name, rowSchema),
        ),
      ),
    );
    const rows = [firstPage, ...remainingPages].flatMap((page) => page.rows);
    if (rows.length !== firstPage.totalCount) {
      throw new Error(
        `NEIS ${name} returned ${rows.length} of ${firstPage.totalCount} expected rows.`,
      );
    }
    return rows;
  }

  private extractNeisPage<T>(
    payload: unknown,
    name: 'mealServiceDietInfo',
    rowSchema: z.ZodType<T>,
  ): NeisPage<T> {
    if (!payload || typeof payload !== 'object') throw new Error('NEIS returned invalid JSON.');
    const root = payload as Record<string, unknown>;
    const result = root.RESULT;
    if (result && typeof result === 'object') {
      const code = (result as Record<string, unknown>).CODE;
      if (code === 'INFO-200') return { rows: [], totalCount: 0 };
      if (code !== 'INFO-000') throw new Error(`NEIS returned result code ${String(code)}.`);
    }

    const collection = root[name];
    if (!Array.isArray(collection)) throw new Error(`NEIS response is missing ${name}.`);
    const headContainer = collection.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        Array.isArray((entry as Record<string, unknown>).head),
    ) as Record<string, unknown> | undefined;
    const head = headContainer?.head as unknown[] | undefined;
    const totalCountValue = head
      ?.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => item.list_total_count)
      .find((item) => item !== undefined);
    const parsedTotalCount = z.coerce.number().int().nonnegative().safeParse(totalCountValue);
    if (!parsedTotalCount.success) {
      throw new Error(`NEIS response is missing a valid ${name} total count.`);
    }
    const nestedResult = head
      ?.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => item.RESULT)
      .find((item) => Boolean(item && typeof item === 'object')) as
      Record<string, unknown> | undefined;
    if (nestedResult?.CODE && nestedResult.CODE !== 'INFO-000') {
      if (nestedResult.CODE === 'INFO-200') return { rows: [], totalCount: 0 };
      throw new Error(`NEIS returned result code ${String(nestedResult.CODE)}.`);
    }
    const rowContainer = collection.find(
      (entry) =>
        entry && typeof entry === 'object' && Array.isArray((entry as Record<string, unknown>).row),
    ) as Record<string, unknown> | undefined;
    if (!rowContainer) return { rows: [], totalCount: parsedTotalCount.data };

    const rawRows = rowContainer.row as unknown[];
    const rows: T[] = [];
    for (const rawRow of rawRows) {
      const parsed = rowSchema.safeParse(rawRow);
      if (parsed.success) rows.push(parsed.data);
    }
    if (rawRows.length > 0 && rows.length === 0) {
      throw new Error(`NEIS ${name} rows did not match the expected schema.`);
    }
    return { rows, totalCount: parsedTotalCount.data };
  }

  private async cachedLoad<T>(
    key: string,
    loader: () => Promise<T>,
    isValid: (value: unknown) => value is T,
    fallback: T,
  ): Promise<LoadResult<T>> {
    const now = Date.now();
    const memory = this.readMemory<T>(key, now);
    if (memory && memory.expiresAt > now) return { value: memory.value, available: true };

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (isValid(parsed)) {
          this.remember(key, parsed);
          return { value: parsed, available: true };
        }
      }
    } catch (error) {
      this.logger.debug(`School data cache read skipped: ${this.safeError(error)}`);
    }

    if (this.readFailureUntil(key, now) > now) {
      if (memory && memory.staleUntil > now) return { value: memory.value, available: true };
      return { value: fallback, available: false };
    }

    try {
      let request = this.inFlight.get(key) as Promise<T> | undefined;
      if (!request) {
        if (this.inFlight.size >= MAX_IN_FLIGHT_LOADS) {
          this.logger.warn('School data request concurrency limit reached.');
          if (memory && memory.staleUntil > now) return { value: memory.value, available: true };
          return { value: fallback, available: false };
        }
        request = loader();
        this.inFlight.set(key, request);
      }
      const value = await request.finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });
      this.failureUntil.delete(key);
      this.remember(key, value);
      try {
        await this.redis.setJson(key, value, env.SCHOOL_DATA_CACHE_TTL_SECONDS);
      } catch (error) {
        this.logger.debug(`School data cache write skipped: ${this.safeError(error)}`);
      }
      return { value, available: true };
    } catch (error) {
      this.logger.warn(`School data ${key.split(':')[1]} unavailable: ${this.safeError(error)}`);
      this.recordFailure(
        key,
        Date.now() + Math.min(env.SCHOOL_DATA_CACHE_TTL_SECONDS * 1000, 60_000),
      );
      if (memory && memory.staleUntil > now) return { value: memory.value, available: true };
      return { value: fallback, available: false };
    }
  }

  private remember<T>(key: string, value: T): void {
    const now = Date.now();
    const ttlMs = env.SCHOOL_DATA_CACHE_TTL_SECONDS * 1000;
    for (const [cachedKey, entry] of this.memoryCache) {
      if (entry.staleUntil <= now) this.memoryCache.delete(cachedKey);
    }
    this.memoryCache.delete(key);
    this.memoryCache.set(key, {
      value,
      expiresAt: now + ttlMs,
      staleUntil: now + Math.max(ttlMs, 86_400_000),
    });
    while (this.memoryCache.size > MAX_MEMORY_CACHE_ENTRIES) {
      const oldestKey = this.memoryCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.memoryCache.delete(oldestKey);
    }
  }

  private readMemory<T>(key: string, now: number): CacheEntry<T> | undefined {
    const entry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.staleUntil <= now) {
      this.memoryCache.delete(key);
      return undefined;
    }
    this.memoryCache.delete(key);
    this.memoryCache.set(key, entry);
    return entry;
  }

  private readFailureUntil(key: string, now: number): number {
    const until = this.failureUntil.get(key);
    if (!until) return 0;
    if (until <= now) {
      this.failureUntil.delete(key);
      return 0;
    }
    this.failureUntil.delete(key);
    this.failureUntil.set(key, until);
    return until;
  }

  private recordFailure(key: string, until: number): void {
    const now = Date.now();
    for (const [failedKey, failedUntil] of this.failureUntil) {
      if (failedUntil <= now) this.failureUntil.delete(failedKey);
    }
    this.failureUntil.delete(key);
    this.failureUntil.set(key, until);
    while (this.failureUntil.size > MAX_FAILURE_ENTRIES) {
      const oldestKey = this.failureUntil.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.failureUntil.delete(oldestKey);
    }
  }

  private toEventValues(input: z.infer<typeof managedEventSchema>) {
    return {
      title: input.title,
      description: input.description || null,
      category: input.category,
      startsAt: parseEventDate(input.startsAt)!,
      endsAt: parseEventDate(input.endsAt, true)!,
      allDay: input.allDay,
      isHoliday: input.isHoliday,
      isPublic: input.isPublic,
    };
  }

  private toAcademicEvent(values: ReturnType<SchoolDataService['toEventValues']>) {
    return {
      title: values.title,
      startsAt: values.startsAt.toISOString(),
      endsAt: values.endsAt.toISOString(),
      allDay: values.allDay,
      description: values.description ?? undefined,
      category: values.category,
      isHoliday: values.isHoliday,
    };
  }

  private toManagedEvent(row: typeof schema.schoolEvents.$inferSelect): ManagedSchoolEvent {
    return {
      id: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      allDay: row.allDay,
      description: row.description ?? undefined,
      category: row.category,
      isHoliday: row.isHoliday,
      isPublic: row.isPublic,
    };
  }

  private safeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') return 'request timed out';
      return error.message.replace(/([?&](?:KEY|apiKey|token)=)[^&\s]+/gi, '$1[redacted]');
    }
    return 'unknown error';
  }
}

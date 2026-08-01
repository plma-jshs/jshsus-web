const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const prettier = require('prettier');
const { SchoolDataService } = require('../dist/modules/school-data/school-data.service.js');

const START_MONTH = process.argv[2] ?? '2025-01';
const END_MONTH = process.argv[3] ?? '2027-12';
const OUTPUT_PATH = resolve(
  __dirname,
  '../src/modules/school-data/school-homepage-calendar.snapshot.ts',
);
const CONCURRENCY = 4;

function assertMonth(value, label) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM.`);
  }
}

function monthKeysBetween(from, to) {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  const current = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
  const end = new Date(Date.UTC(toYear, toMonth - 1, 1));
  const keys = [];

  while (current <= end) {
    keys.push(`${current.getUTCFullYear()}${String(current.getUTCMonth() + 1).padStart(2, '0')}`);
    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return keys;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function serialize(events) {
  return [
    "import type { AcademicEvent } from '@jshsus/types';",
    '',
    '// Snapshot generated from the Jeonnam Science High School homepage calendar.',
    '// Regenerate with: pnpm --filter @jshsus/api snapshot:calendar',
    '// It is the reliable fallback when the deployment network cannot reach the school homepage.',
    `export const schoolHomepageCalendarSnapshot: AcademicEvent[] = ${JSON.stringify(events, null, 2)};`,
    '',
  ].join('\n');
}

async function main() {
  assertMonth(START_MONTH, 'Start month');
  assertMonth(END_MONTH, 'End month');
  if (START_MONTH > END_MONTH) throw new Error('Start month must not be after end month.');

  const service = new SchoolDataService(
    {},
    {
      get: async () => null,
      setJson: async () => undefined,
    },
  );
  const internal = service;
  const months = monthKeysBetween(START_MONTH, END_MONTH);
  const pages = await mapWithConcurrency(months, CONCURRENCY, async (yearMonth) => {
    const html = await internal.requestSchoolHomepageCalendar(yearMonth);
    const events = internal.parseSchoolHomepageCalendar(html);
    process.stdout.write(`${yearMonth}: ${events.length} events\n`);
    return events;
  });

  const eventsById = new Map();
  for (const event of pages.flat()) {
    const key = `${event.id}:${event.startsAt}:${event.title}`;
    eventsById.set(key, event);
  }
  const events = [...eventsById.values()].sort((left, right) =>
    left.startsAt === right.startsAt
      ? left.title.localeCompare(right.title, 'ko-KR')
      : left.startsAt.localeCompare(right.startsAt),
  );

  const prettierConfig = (await prettier.resolveConfig(OUTPUT_PATH)) ?? {};
  const output = await prettier.format(serialize(events), {
    ...prettierConfig,
    filepath: OUTPUT_PATH,
  });
  writeFileSync(OUTPUT_PATH, output, 'utf8');
  process.stdout.write(
    `Saved ${events.length} events from ${START_MONTH} through ${END_MONTH} to ${OUTPUT_PATH}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

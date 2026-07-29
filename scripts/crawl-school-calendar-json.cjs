#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const CALENDAR_URL =
  'https://jeonnam-sh.jge.hs.kr/chonnam-sh_hs/schl/sv/schdulView/schdulCalendarView.do';
const MENU_ID = '52322';

const entities = {
  amp: '&',
  apos: "'",
  bull: '•',
  gt: '>',
  hellip: '...',
  ldquo: '"',
  lsquo: "'",
  lt: '<',
  mdash: '-',
  middot: '·',
  nbsp: ' ',
  ndash: '-',
  quot: '"',
  rdquo: '"',
  rsquo: "'",
};

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);?/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z][a-z0-9]+);?/gi, (match, name) => entities[name.toLowerCase()] ?? match);
}

function stripHtml(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/^\s*·\s*/, '')
    .trim();
}

function htmlAttribute(value, name) {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(value);
  const raw = match?.[2] ?? match?.[3] ?? match?.[4];
  return raw ? decodeEntities(raw) : undefined;
}

function compactToDate(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeTitle(value) {
  return decodeEntities(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s*[(（]\s*~\s*\d{1,2}\s*일\s*[)）]\s*$/, '')
    .replace(/^\s*·\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferEndDate(title, startsAt) {
  const rangeMatch = /[(（]\s*~\s*(\d{1,2})\s*일\s*[)）]/.exec(title);
  if (!rangeMatch) return startsAt;
  const [year, month, day] = startsAt.split('-').map(Number);
  const endDay = Number(rangeMatch[1]);
  const endMonthOffset = endDay < day ? 1 : 0;
  return new Date(Date.UTC(year, month - 1 + endMonthOffset, endDay)).toISOString().slice(0, 10);
}

function hasRedBackground(attributes) {
  const style = htmlAttribute(attributes, 'style')?.replace(/\s+/g, '').toLowerCase() ?? '';
  return /background(?:-color)?:#?(?:f00|ff0000)\b/.test(style);
}

function parseEvents(html) {
  const grouped = new Map();
  const cellRegex = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
  let cellMatch;
  while ((cellMatch = cellRegex.exec(html))) {
    const dateId = htmlAttribute(cellMatch[1], 'id');
    if (!dateId || !/^\d{8}$/.test(dateId)) continue;
    const startsAt = compactToDate(dateId);
    const eventRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let eventMatch;
    while ((eventMatch = eventRegex.exec(cellMatch[2]))) {
      const attributes = eventMatch[1];
      const className = htmlAttribute(attributes, 'class') ?? '';
      if (!className.split(/\s+/).includes('calLink')) continue;

      const rawTitle = htmlAttribute(attributes, 'data-schdulTitle') ?? stripHtml(eventMatch[2]);
      const title = normalizeTitle(rawTitle);
      if (!title) continue;

      const seq = htmlAttribute(attributes, 'data-seq');
      const isManagedLink = className.split(/\s+/).includes('btnInfo');
      const isHoliday = !isManagedLink && hasRedBackground(attributes);
      const endsAt = inferEndDate(rawTitle, startsAt);
      const key = seq ? `seq:${seq}:${title}` : `date:${startsAt}:${title}`;
      const previous = grouped.get(key);
      grouped.set(key, {
        title,
        startsAt: previous?.startsAt && previous.startsAt < startsAt ? previous.startsAt : startsAt,
        endsAt: previous?.endsAt && previous.endsAt > endsAt ? previous.endsAt : endsAt,
        allDay: true,
        category: isHoliday ? 'holiday' : isManagedLink ? 'academic' : 'observance',
        isHoliday,
        isPublic: true,
      });
    }
  }
  return [...grouped.values()];
}

function monthKeys(from, to) {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  const current = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
  const end = new Date(Date.UTC(toYear, toMonth - 1, 1));
  const keys = [];
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

async function fetchMonth(yearMonth) {
  const params = new URLSearchParams({
    mi: MENU_ID,
    selectYearMonth: yearMonth,
    selectType: 'haksa',
    sysId: 'chonnam-sh_hs',
  });
  const response = await fetch(`${CALENDAR_URL}?${params.toString()}`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'jshsus-calendar-sync-local/1.0',
    },
  });
  if (!response.ok) throw new Error(`${yearMonth}: HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes('selectYearMonth')) throw new Error(`${yearMonth}: calendar markup missing`);
  return html;
}

async function main() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const from = argValue('from') ?? argValue('month') ?? currentMonth;
  const to = argValue('to') ?? from;
  const out = argValue('out') ?? `school-calendar-${from}-${to}.json`;
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    throw new Error('Use --from YYYY-MM and --to YYYY-MM.');
  }

  const eventsByKey = new Map();
  for (const yearMonth of monthKeys(from, to)) {
    const html = await fetchMonth(yearMonth);
    for (const event of parseEvents(html)) {
      eventsByKey.set(`${event.startsAt}:${event.endsAt}:${event.title}`, event);
    }
  }

  const payload = {
    source: 'jeonnam-sh-homepage',
    crawledAt: new Date().toISOString(),
    events: [...eventsByKey.values()].sort(
      (left, right) =>
        left.startsAt.localeCompare(right.startsAt) || left.title.localeCompare(right.title, 'ko'),
    ),
  };
  fs.writeFileSync(path.resolve(out), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${payload.events.length} events to ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { describe, expect, it } from 'vitest';
import { parsePositiveRouteId, safeInternalReturnTo } from './route';

describe('parsePositiveRouteId', () => {
  it.each([
    ['', null],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['1e2', null],
    [' 1 ', null],
    ['abc', null],
    ['9007199254740992', null],
    ['1', 1],
    ['42', 42],
  ])('parses %j as %j', (value, expected) => {
    expect(parsePositiveRouteId(value)).toBe(expected);
  });
});

describe('safeInternalReturnTo', () => {
  const origin = 'https://v26.jshsus.kr';

  it.each([
    '/notices/14',
    '/boards/free?page=2&q=%ED%95%99%EA%B5%90#comments',
    '/calendar?month=2026-07#day-13',
  ])('preserves the safe internal destination %s', (returnTo) => {
    expect(safeInternalReturnTo(returnTo, origin)).toBe(returnTo);
  });

  it.each([
    [null, 'missing value'],
    ['', 'empty value'],
    ['boards/free', 'non-root-relative path'],
    ['https://evil.example/steal', 'cross-origin absolute URL'],
    ['//evil.example/steal', 'protocol-relative URL'],
    ['/\\evil.example/steal', 'backslash authority bypass'],
    ['/%5cevil.example/steal', 'encoded backslash'],
    ['/%255cevil.example/steal', 'nested encoded backslash'],
    ['/%2f%2fevil.example/steal', 'encoded protocol-relative URL'],
    ['/notices/1%0ajavascript:alert(1)', 'encoded control character'],
    ['/notices/1\u0000', 'literal control character'],
    ['/notices/%', 'malformed percent escape'],
  ])('falls back to home for a $1', (returnTo, _label) => {
    expect(safeInternalReturnTo(returnTo, origin)).toBe('/');
  });
});

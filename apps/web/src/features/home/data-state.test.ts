import { describe, expect, it } from 'vitest';
import {
  canShowConfirmedEmptyState,
  resolveCalendarCardState,
  resolveMealCardState,
} from './data-state';

describe('home school-data card state', () => {
  it('does not treat a successful but unavailable meal response as an empty menu', () => {
    const state = resolveMealCardState({
      loading: false,
      failed: false,
      availability: 'unavailable',
    });

    expect(state).toBe('unavailable');
    expect(canShowConfirmedEmptyState(state)).toBe(false);
  });

  it('keeps partial calendar data distinct from a confirmed empty calendar', () => {
    const state = resolveCalendarCardState({
      loading: false,
      failed: false,
      availability: 'partial',
    });

    expect(state).toBe('partial');
    expect(canShowConfirmedEmptyState(state)).toBe(false);
  });

  it('allows an empty-state message only when every requested source is available', () => {
    expect(canShowConfirmedEmptyState('available')).toBe(true);
    expect(canShowConfirmedEmptyState('error')).toBe(false);
    expect(canShowConfirmedEmptyState('unavailable')).toBe(false);
  });
});

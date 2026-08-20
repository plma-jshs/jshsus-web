import type { SchoolDataAvailability, SchoolDataSourceAvailability } from '@jshsus/types';

export type SchoolDataCardState = 'loading' | 'available' | 'partial' | 'unavailable' | 'error';

export function resolveMealCardState(input: {
  loading: boolean;
  failed: boolean;
  availability?: SchoolDataSourceAvailability;
}): SchoolDataCardState {
  if (input.failed) return 'error';
  if (input.loading) return 'loading';
  return input.availability ?? 'unavailable';
}

export function resolveCalendarCardState(input: {
  loading: boolean;
  failed: boolean;
  availability?: SchoolDataAvailability;
}): SchoolDataCardState {
  if (input.failed) return 'error';
  if (input.loading) return 'loading';
  return input.availability ?? 'unavailable';
}

export function canShowConfirmedEmptyState(state: SchoolDataCardState): boolean {
  return state === 'available';
}

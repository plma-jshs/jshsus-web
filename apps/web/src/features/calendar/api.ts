import type { AcademicEvent, SchoolDataAvailability } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getCalendar(from: string, to: string) {
  const search = new URLSearchParams({ from, to });
  return request<{
    from: string;
    to: string;
    events: AcademicEvent[];
    available: boolean;
    availability: SchoolDataAvailability;
    neisAvailable: boolean;
    schoolEventsAvailable: boolean;
  }>(`/api/school-data/calendar?${search.toString()}`);
}

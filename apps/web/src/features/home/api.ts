import type {
  AcademicEvent,
  HomeDashboard,
  SchoolDataAvailability,
  SchoolMeal,
} from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getHomeDashboard() {
  return request<HomeDashboard>('/api/home');
}

export function getSchoolMeals(date: string) {
  const search = new URLSearchParams({ date });
  return request<{ date: string; meals: SchoolMeal[]; available: boolean }>(
    `/api/school-data/meals?${search.toString()}`,
  );
}

export function getSchoolCalendar(from: string, to: string) {
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

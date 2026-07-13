import { describe, expect, it, vi } from 'vitest';
import type { BoardsService } from '../boards/boards.service';
import type { NoticesService } from '../notices/notices.service';
import type { PetitionsService } from '../petitions/petitions.service';
import type { SchoolDataService } from '../school-data/school-data.service';
import { HomeController } from './home.controller';

describe('HomeController', () => {
  it('returns the unified dashboard contract with recent free-board posts', async () => {
    const notices = { listDashboard: vi.fn().mockResolvedValue([]) } as unknown as NoticesService;
    const boards = {
      listPosts: vi.fn().mockResolvedValue([{ id: 7, title: '최근 글' }]),
    } as unknown as BoardsService;
    const petitions = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as PetitionsService;
    const schoolData = {
      getHomeData: vi.fn().mockResolvedValue({
        mealDate: '2026-07-12',
        scheduleFrom: '2026-07-01',
        scheduleTo: '2026-07-31',
        meals: [],
        academicEvents: [],
        availability: 'partial',
        mealAvailability: 'unavailable',
        calendarAvailability: 'partial',
        neisCalendarAvailability: 'unavailable',
        schoolEventsAvailability: 'available',
      }),
    } as unknown as SchoolDataService;
    const controller = new HomeController(notices, boards, petitions, schoolData);

    const result = await controller.dashboard();

    expect(boards.listPosts).toHaveBeenCalledWith('free', 5);
    expect(result.boardPosts).toEqual([{ id: 7, title: '최근 글' }]);
    expect(result.meals).toEqual([]);
    expect(result.academicEvents).toEqual([]);
    expect(result.schoolData).toEqual({
      mealDate: '2026-07-12',
      scheduleFrom: '2026-07-01',
      scheduleTo: '2026-07-31',
      availability: 'partial',
      mealAvailability: 'unavailable',
      calendarAvailability: 'partial',
      neisCalendarAvailability: 'unavailable',
      schoolEventsAvailability: 'available',
    });
  });
});

import { Controller, Get } from '@nestjs/common';
import type { HomeDashboard } from '@jshsus/types';
import { BoardsService } from '../boards/boards.service';
import { NoticesService } from '../notices/notices.service';
import { PetitionsService } from '../petitions/petitions.service';
import { SchoolDataService } from '../school-data/school-data.service';

@Controller('home')
export class HomeController {
  constructor(
    private readonly noticesService: NoticesService,
    private readonly boardsService: BoardsService,
    private readonly petitionsService: PetitionsService,
    private readonly schoolDataService: SchoolDataService,
  ) {}

  @Get()
  async dashboard(): Promise<HomeDashboard> {
    const [notices, petitions, boardPosts, schoolData] = await Promise.all([
      this.noticesService.listDashboard(),
      this.petitionsService.list(),
      this.boardsService.listPosts('free', 5),
      this.schoolDataService.getHomeData(),
    ]);

    return {
      notices,
      petitions: petitions.slice(0, 5).map((petition) => ({
        id: petition.id,
        title: petition.title,
        participantCount: petition.participantCount,
        threshold: petition.threshold,
        startsAt: petition.startsAt,
        endsAt: petition.endsAt,
        status: petition.status,
      })),
      meals: schoolData.meals,
      academicEvents: schoolData.academicEvents,
      boardPosts,
      schoolData: {
        mealDate: schoolData.mealDate,
        scheduleFrom: schoolData.scheduleFrom,
        scheduleTo: schoolData.scheduleTo,
        availability: schoolData.availability,
        mealAvailability: schoolData.mealAvailability,
        calendarAvailability: schoolData.calendarAvailability,
        neisCalendarAvailability: schoolData.neisCalendarAvailability,
        schoolEventsAvailability: schoolData.schoolEventsAvailability,
      },
    };
  }
}

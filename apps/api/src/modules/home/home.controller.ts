import { Controller, Get } from '@nestjs/common';
import type { HomeDashboard } from '@jshsus/types';
import { ContentService } from '../content/content.service';
import { PetitionsService } from '../petitions/petitions.service';
import { SchoolDataService } from '../school-data/school-data.service';

@Controller('home')
export class HomeController {
  constructor(
    private readonly contentService: ContentService,
    private readonly petitionsService: PetitionsService,
    private readonly schoolDataService: SchoolDataService,
  ) {}

  @Get()
  async dashboard(): Promise<HomeDashboard> {
    const [notices, petitions, lostItems, boardPosts, schoolData] = await Promise.all([
      this.contentService.listDashboardNotices(),
      this.petitionsService.list(),
      this.contentService.listDashboardLostItems(),
      this.contentService.listBoardPosts('free', 5),
      this.schoolDataService.getHomeData(),
    ]);

    return {
      notices,
      petitions: petitions.slice(0, 5).map((petition) => ({
        id: petition.id,
        title: petition.title,
        participantCount: petition.participantCount,
        threshold: petition.threshold,
        endsAt: petition.endsAt,
        status: petition.status,
      })),
      lostItems,
      meals: schoolData.meals,
      academicEvents: schoolData.academicEvents,
      boardPosts,
      schoolData: {
        mealDate: schoolData.mealDate,
        scheduleFrom: schoolData.scheduleFrom,
        scheduleTo: schoolData.scheduleTo,
        availability: schoolData.availability,
      },
      quickLinks: [
        { id: 'points', label: '내 상벌점', href: '/my-status' },
        { id: 'activity', label: '탐활서', href: '/activity-requests' },
        { id: 'notices', label: '공지사항', href: '/notices' },
        { id: 'board', label: '자유게시판', href: '/boards/free' },
        { id: 'petitions', label: '청원·제안', href: '/petitions' },
        { id: 'lost', label: '분실물', href: '/lost-items' },
      ],
    };
  }
}

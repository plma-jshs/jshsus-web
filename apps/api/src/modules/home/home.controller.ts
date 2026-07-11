import { Controller, Get } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import { PetitionsService } from '../petitions/petitions.service';

@Controller('home')
export class HomeController {
  constructor(
    private readonly contentService: ContentService,
    private readonly petitionsService: PetitionsService,
  ) {}

  @Get()
  async dashboard() {
    const [notices, petitions, lostItems] = await Promise.all([
      this.contentService.listDashboardNotices(),
      this.petitionsService.list(),
      this.contentService.listDashboardLostItems(),
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

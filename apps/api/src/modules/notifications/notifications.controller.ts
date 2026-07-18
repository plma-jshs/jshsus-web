import { Controller, Get, Param, ParseIntPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { SessionGuard } from '../../shared/auth/session.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SessionGuard, CsrfGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.listForUser(request.authSession?.userId);
  }

  @Patch('read-all')
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.markAllRead(request.authSession?.userId);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest) {
    return this.notificationsService.markRead(id, request.authSession?.userId);
  }
}

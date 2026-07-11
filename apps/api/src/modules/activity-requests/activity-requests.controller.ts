import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { ActivityRequestsService } from './activity-requests.service';

@Controller()
export class ActivityRequestsController {
  constructor(private readonly activityRequestsService: ActivityRequestsService) {}

  @Post('activity-requests')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.create(body, request.authSession);
  }

  @Get('activity-requests/me')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  myRequests(@Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.myRequests(request.authSession);
  }

  @Post('activity-requests/:id/cancel')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.cancel(Number(id), request.authSession);
  }

  @Get('admin/activity-requests')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('activity.review')
  adminList() {
    return this.activityRequestsService.adminList();
  }

  @Post('admin/activity-requests/:id/approve')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('activity.review')
  approve(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.approve(Number(id), request.authSession?.userId);
  }

  @Post('admin/activity-requests/:id/reject')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('activity.review')
  reject(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.reject(Number(id), body, request.authSession?.userId);
  }

  @Post('admin/activity-requests/:id/print')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('activity.review')
  print(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.markPrinted(Number(id), request.authSession?.userId);
  }
}

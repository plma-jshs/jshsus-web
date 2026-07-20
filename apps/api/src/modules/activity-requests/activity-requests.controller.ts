import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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

  @Get('activity-requests/students')
  @UseGuards(SessionGuard, RolesGuard)
  @RequireRoles('student')
  participantStudents(@Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.participantStudentOptions(request.authSession);
  }

  @Get('activity-requests/teachers')
  @UseGuards(SessionGuard, RolesGuard)
  @RequireRoles('student', 'teacher')
  teachers() {
    return this.activityRequestsService.teacherOptions();
  }

  @Get('activity-requests/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  detail(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.getMyRequest(Number(id), request.authSession);
  }

  @Put('activity-requests/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.update(Number(id), body, request.authSession);
  }

  @Post('activity-requests/:id/cancel')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.cancel(Number(id), request.authSession);
  }

  @Delete('activity-requests/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  delete(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.delete(Number(id), request.authSession);
  }

  @Get('admin/activity-requests')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('activity.review')
  adminList(@Query() query: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.adminList(query, request.authSession?.userId);
  }

  @Get('admin/activity-requests/students')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('activity.review')
  adminStudents() {
    return this.activityRequestsService.adminStudentOptions();
  }

  @Get('admin/activity-requests/teachers')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('activity.review')
  adminTeachers() {
    return this.activityRequestsService.teacherOptions();
  }

  @Post('admin/activity-requests')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('activity.review')
  adminCreate(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.adminCreate(body, request.authSession?.userId);
  }

  @Post('admin/activity-requests/print/today')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('activity.review')
  printToday(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.activityRequestsService.printToday(body, request.authSession?.userId);
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
}

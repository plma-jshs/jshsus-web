import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { ReportsService } from './reports.service';

const memberRoles = [
  'student',
  'student_council',
  'teacher',
  'student_affairs_head',
  'system_admin',
] as const;

@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('reports')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createReport(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.reportsService.create(body, request.authSession?.userId);
  }

  @Get('admin/reports')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('content.manage')
  reports() {
    return this.reportsService.list();
  }

  @Put('admin/reports/:id/status')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  updateReportStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reportsService.updateStatus(Number(id), body, request.authSession?.userId);
  }
}

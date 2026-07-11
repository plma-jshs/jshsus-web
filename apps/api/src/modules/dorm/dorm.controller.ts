import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RequirePermissions } from '../../shared/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { SessionGuard } from '../../shared/auth/session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { DormService } from './dorm.service';

@Controller('admin/dorm')
@UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
@RequirePermissions('dorm.manage')
export class DormController {
  constructor(private readonly dormService: DormService) {}

  @Get('rooms')
  rooms() {
    return this.dormService.rooms();
  }

  @Get('students')
  students() {
    return this.dormService.students();
  }

  @Get('assignments')
  assignments() {
    return this.dormService.assignments();
  }

  @Get('reports')
  reports() {
    return this.dormService.reports();
  }

  @Post('assignments')
  createAssignment(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.dormService.createAssignment(body, request.authSession?.userId);
  }

  @Put('reports/:id/status')
  updateReportStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dormService.updateReportStatus(Number(id), body, request.authSession?.userId);
  }
}

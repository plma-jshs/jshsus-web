import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RequirePermissions } from '../../shared/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { SessionGuard } from '../../shared/auth/session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { PointsService } from './points.service';

@Controller('admin/points')
@UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
@RequirePermissions('points.manage')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('summary')
  summary() {
    return this.pointsService.getSummary();
  }

  @Get('students')
  students() {
    return this.pointsService.getStudents();
  }

  @Get('records')
  records() {
    return this.pointsService.getRecords();
  }

  @Post('records')
  createRecord(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.pointsService.createRecord(body, request.authSession?.userId);
  }

  @Post('records/:id/cancel')
  cancelRecord(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pointsService.cancelRecord(Number(id), body, request.authSession?.userId);
  }

  @Post('records/:id/restore')
  restoreRecord(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pointsService.restoreRecord(Number(id), body, request.authSession?.userId);
  }

  @Get('reasons')
  reasons() {
    return this.pointsService.getReasons();
  }

  @Post('reasons')
  createReason(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.pointsService.createReason(body, request.authSession?.userId);
  }
}

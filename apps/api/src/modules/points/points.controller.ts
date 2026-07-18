import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  @RequirePermissions('points.issue')
  students() {
    return this.pointsService.getStudents();
  }

  @Get('students/page')
  @RequirePermissions('points.issue')
  studentPage(@Query() query: Record<string, unknown>) {
    return this.pointsService.getStudentPage(query);
  }

  @Get('records')
  records() {
    return this.pointsService.getRecords();
  }

  @Get('records/page')
  recordPage(@Query() query: Record<string, unknown>) {
    return this.pointsService.getRecordPage(query);
  }

  @Post('records')
  @RequirePermissions('points.issue')
  createRecord(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.pointsService.createRecord(body, request.authSession?.userId);
  }

  @Post('records/batch')
  @RequirePermissions('points.issue')
  createRecordBatch(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.pointsService.createRecordBatch(body, request.authSession?.userId);
  }

  @Post('records/import-preview')
  @RequirePermissions('points.issue')
  previewRecordImport(@Body() body: unknown) {
    return this.pointsService.previewRecordImport(body);
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
  @RequirePermissions('points.issue')
  reasons() {
    return this.pointsService.getReasons();
  }

  @Get('reasons/page')
  @RequirePermissions('points.issue')
  reasonPage(@Query() query: Record<string, unknown>) {
    return this.pointsService.getReasonPage(query);
  }

  @Post('reasons')
  createReason(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.pointsService.createReason(body, request.authSession?.userId);
  }

  @Patch('reasons/:id')
  updateReason(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pointsService.updateReason(Number(id), body, request.authSession?.userId);
  }

  @Get('departure-cases')
  departureCases() {
    return this.pointsService.getDepartureCases();
  }

  @Get('departure-candidates/page')
  departureCandidatePage(@Query() query: Record<string, unknown>) {
    return this.pointsService.getDeparturePage(query);
  }

  @Get('departure-history/page')
  departureHistoryPage(@Query() query: Record<string, unknown>) {
    return this.pointsService.getDepartureHistoryPage(query);
  }

  @Post('departure-cases/sync')
  syncDepartureCases(@Req() request: AuthenticatedRequest) {
    return this.pointsService.syncDepartureCandidates(request.authSession?.userId);
  }

  @Post('departure-cases/:id/complete')
  completeDepartureCase(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pointsService.completeDepartureCase(Number(id), body, request.authSession?.userId);
  }

  @Post('departure-cases/:id/dismiss')
  dismissDepartureCase(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pointsService.dismissDepartureCase(Number(id), body, request.authSession?.userId);
  }

  @Post('departures/:studentId/approve')
  approveDeparture(
    @Param('studentId') studentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pointsService.approveDepartureStudent(
      Number(studentId),
      body,
      request.authSession?.userId,
    );
  }

  @Post('semester-half/preview')
  previewSemesterHalf(@Body() body: unknown) {
    return this.pointsService.previewSemesterHalf(body);
  }

  @Post('semester-half')
  applySemesterHalf(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.pointsService.applySemesterHalf(body, request.authSession?.userId);
  }
}

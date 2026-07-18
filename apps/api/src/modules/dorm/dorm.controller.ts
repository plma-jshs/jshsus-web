import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
  rooms(@Query() query: Record<string, unknown>) {
    return this.dormService.rooms(query);
  }

  @Get('students')
  students(@Query() query: Record<string, unknown>) {
    return this.dormService.students(query);
  }

  @Get('assignments')
  assignments(@Query() query: Record<string, unknown>) {
    return this.dormService.assignments(query);
  }

  @Get('reports')
  reports() {
    return this.dormService.reports();
  }

  @Post('assignments')
  createAssignment(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.dormService.createAssignment(body, request.authSession?.userId);
  }

  @Put('assignments/:id')
  moveAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dormService.moveAssignment(id, body, request.authSession?.userId);
  }

  @Post('assignments/swap')
  swapAssignments(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.dormService.swapAssignments(body, request.authSession?.userId);
  }

  @Delete('assignments/:id')
  cancelAssignment(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest) {
    return this.dormService.cancelAssignment(id, request.authSession?.userId);
  }

  @Get('roommate-blocks')
  roommateBlocks(@Query() query: Record<string, unknown>) {
    return this.dormService.roommateBlocks(query);
  }

  @Post('roommate-blocks')
  createRoommateBlock(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.dormService.createRoommateBlock(body, request.authSession?.userId);
  }

  @Delete('roommate-blocks/:id')
  deleteRoommateBlock(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest) {
    return this.dormService.deleteRoommateBlock(id, request.authSession?.userId);
  }

  @Post('draw/preview')
  previewDraw(@Body() body: unknown) {
    return this.dormService.previewDraw(body);
  }

  @Post('draw/apply')
  applyDraw(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.dormService.applyDraw(body, request.authSession?.userId);
  }

  @Put('reports/:id/status')
  updateReportStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dormService.updateReportStatus(id, body, request.authSession?.userId);
  }
}

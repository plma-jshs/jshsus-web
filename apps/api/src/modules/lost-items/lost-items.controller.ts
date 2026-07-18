import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { OptionalSessionGuard } from '../../shared/auth/optional-session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { LostItemsService } from './lost-items.service';

const memberRoles = [
  'student',
  'student_council',
  'teacher',
  'student_affairs_head',
  'system_admin',
] as const;

@Controller()
export class LostItemsController {
  constructor(private readonly lostItemsService: LostItemsService) {}

  @Get('lost-items')
  lostItems() {
    return this.lostItemsService.list();
  }

  @Get('lost-items/:id')
  @UseGuards(OptionalSessionGuard)
  lostItem(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.lostItemsService.getById(Number(id), request.authSession?.userId);
  }

  @Get('admin/lost-items')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('lost_items.manage')
  adminLostItems() {
    return this.lostItemsService.list(100, true);
  }

  @Post('lost-items')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createLostItem(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.lostItemsService.create(body, request.authSession?.userId);
  }

  @Put('lost-items/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  updateLostItem(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lostItemsService.update(Number(id), body, request.authSession?.userId);
  }

  @Put('lost-items/:id/status')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  updateOwnLostItemStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lostItemsService.updateStatus(Number(id), body, request.authSession?.userId);
  }
  @Delete('lost-items/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  discardLostItem(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.lostItemsService.discard(Number(id), request.authSession?.userId);
  }

  @Put('admin/lost-items/:id/status')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('lost_items.manage')
  updateLostItemStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lostItemsService.updateStatus(Number(id), body, request.authSession?.userId, true);
  }

  @Delete('admin/lost-items/:id')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('lost_items.manage')
  deleteManagedLostItem(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.lostItemsService.discard(Number(id), request.authSession?.userId, true);
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { ContentService } from './content.service';

const memberRoles = [
  'student',
  'student_council',
  'teacher',
  'student_affairs_head',
  'system_admin',
] as const;
@Controller()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('notices')
  notices() {
    return this.contentService.listNotices();
  }

  @Get('admin/notices')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('content.manage')
  adminNotices() {
    return this.contentService.listNotices(100, true);
  }

  @Post('admin/notices')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  createNotice(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.contentService.createNotice(body, request.authSession?.userId);
  }

  @Put('admin/notices/:id')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  updateNotice(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contentService.updateNotice(Number(id), body, request.authSession?.userId);
  }

  @Delete('admin/notices/:id')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  deleteNotice(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.contentService.deleteNotice(Number(id), request.authSession?.userId);
  }

  @Get('boards/:slug/posts')
  boardPosts(@Param('slug') slug: string) {
    return this.contentService.listBoardPosts(slug);
  }

  @Get('admin/boards/:slug/posts')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('content.manage')
  adminBoardPosts(@Param('slug') slug: string) {
    return this.contentService.listBoardPosts(slug, 100, true);
  }

  @Post('boards/:slug/posts')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createBoardPost(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contentService.createBoardPost(slug, body, request.authSession?.userId);
  }

  @Get('boards/:slug/posts/:id/comments')
  boardComments(@Param('id') id: string) {
    return this.contentService.listComments(Number(id));
  }

  @Get('admin/boards/:slug/posts/:id/comments')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('content.manage')
  adminBoardComments(@Param('id') id: string) {
    return this.contentService.listComments(Number(id), true);
  }

  @Post('boards/:slug/posts/:id/comments')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createComment(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contentService.createComment(Number(id), body, request.authSession?.userId);
  }

  @Put('admin/boards/posts/:id/hidden')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  updatePostHidden(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contentService.updatePostHidden(Number(id), body, request.authSession?.userId);
  }

  @Put('admin/boards/comments/:id/hidden')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  updateCommentHidden(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contentService.updateCommentHidden(Number(id), body, request.authSession?.userId);
  }

  @Post('reports')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createReport(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.contentService.createReport(body, request.authSession?.userId);
  }

  @Get('admin/reports')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('content.manage')
  reports() {
    return this.contentService.listReports();
  }

  @Put('admin/reports/:id/status')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  updateReportStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contentService.updateReportStatus(Number(id), body, request.authSession?.userId);
  }

  @Get('lost-items')
  lostItems() {
    return this.contentService.listLostItems();
  }

  @Get('admin/lost-items')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('content.manage')
  adminLostItems() {
    return this.contentService.listLostItems(100, true);
  }

  @Post('lost-items')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createLostItem(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.contentService.createLostItem(body, request.authSession?.userId);
  }

  @Put('admin/lost-items/:id/status')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  updateLostItemStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contentService.updateLostItemStatus(Number(id), body, request.authSession?.userId);
  }
}

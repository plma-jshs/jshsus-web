import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { RateLimit } from '../../shared/security/rate-limit.guard';
import { WakeSongsService } from './wake-songs.service';

@Controller()
export class WakeSongsController {
  constructor(private readonly wakeSongs: WakeSongsService) {}

  @Get('wake-songs/preview')
  @RateLimit({ max: 10, windowSeconds: 60 })
  @UseGuards(SessionGuard, RolesGuard)
  @RequireRoles('student')
  preview(@Query('url') url: string) {
    return this.wakeSongs.preview(url);
  }

  @Get('wake-songs/me')
  @UseGuards(SessionGuard, RolesGuard)
  @RequireRoles('student')
  myRequests(@Req() request: AuthenticatedRequest) {
    return this.wakeSongs.myRequests(request.authSession);
  }

  @Post('wake-songs')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.wakeSongs.create(body, request.authSession);
  }

  @Put('wake-songs/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.wakeSongs.update(Number(id), body, request.authSession);
  }

  @Post('wake-songs/:id/cancel')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.wakeSongs.cancel(Number(id), request.authSession);
  }

  @Get('admin/wake-songs')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('wake_songs.review')
  adminList(@Query() query: unknown) {
    return this.wakeSongs.adminList(query);
  }

  @Post('admin/wake-songs/:id/approve')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('wake_songs.review')
  approve(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.wakeSongs.approve(Number(id), request.authSession?.userId);
  }

  @Post('admin/wake-songs/:id/reject')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('wake_songs.review')
  reject(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.wakeSongs.reject(Number(id), body, request.authSession?.userId);
  }

  @Post('admin/wake-songs/:id/schedule')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('wake_songs.review')
  schedule(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.wakeSongs.schedule(Number(id), body, request.authSession?.userId);
  }

  @Post('admin/wake-songs/:id/played')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('wake_songs.review')
  markPlayed(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.wakeSongs.markPlayed(Number(id), request.authSession?.userId);
  }
}

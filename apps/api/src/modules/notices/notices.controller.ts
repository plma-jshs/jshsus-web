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
import { RequirePermissions } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { SessionGuard } from '../../shared/auth/session.guard';
import { parseContentListQuery } from '../../shared/content-list-query';
import { NoticesService } from './notices.service';

@Controller()
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get('notices')
  notices(@Query() query: unknown) {
    return this.noticesService.listPage(parseContentListQuery(query));
  }

  @Get('notices/:id')
  notice(@Param('id') id: string) {
    return this.noticesService.getDetail(Number(id));
  }

  @Get('admin/notices')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('content.manage')
  adminNotices() {
    return this.noticesService.list(100, true);
  }

  @Post('admin/notices')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  createNotice(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.noticesService.create(body, request.authSession?.userId);
  }

  @Put('admin/notices/:id')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  updateNotice(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.noticesService.update(Number(id), body, request.authSession?.userId);
  }

  @Delete('admin/notices/:id')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('content.manage')
  deleteNotice(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.noticesService.delete(Number(id), request.authSession?.userId);
  }
}

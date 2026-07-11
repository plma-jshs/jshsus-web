import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { PetitionsService } from './petitions.service';

@Controller()
export class PetitionsController {
  constructor(private readonly petitionsService: PetitionsService) {}

  @Get('petitions')
  list() {
    return this.petitionsService.list();
  }

  @Post('petitions')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.petitionsService.create(body, request.authSession?.userId);
  }

  @Post('petitions/:id/participate')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles('student')
  participate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.petitionsService.participate(Number(id), request.authSession?.userId);
  }

  @Post('admin/petitions/:id/answer')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('petitions.answer')
  answer(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.petitionsService.answer(Number(id), body, request.authSession?.userId);
  }
}

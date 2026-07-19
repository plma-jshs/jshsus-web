import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { ThanksService } from './thanks.service';

@Controller('thanks')
@UseGuards(SessionGuard)
export class ThanksController {
  constructor(private readonly thanksService: ThanksService) {}

  @Get()
  list() {
    return this.thanksService.list();
  }

  @Post()
  @UseGuards(RolesGuard, CsrfGuard)
  @RequireRoles('student')
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.thanksService.create(body, request.authSession);
  }
}

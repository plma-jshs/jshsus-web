import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../shared/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { RateLimit } from '../../shared/security/rate-limit.guard';
import { MeService } from './me.service';

@Controller('me')
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles('student')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('status')
  status(@Req() request: AuthenticatedRequest) {
    return this.meService.status(request.authSession);
  }

  @Patch('profile')
  @UseGuards(CsrfGuard)
  updateProfile(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.meService.updateProfile(request.authSession, body);
  }

  @Patch('contact')
  @UseGuards(CsrfGuard)
  updateContact(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.meService.updateContact(request.authSession, body);
  }

  @Post('contact/verification')
  @UseGuards(CsrfGuard)
  @RateLimit({ max: 5, windowSeconds: 900 })
  requestContactVerification(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.meService.requestContactVerification(request.authSession, body);
  }
}

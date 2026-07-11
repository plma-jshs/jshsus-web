import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../shared/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
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
}

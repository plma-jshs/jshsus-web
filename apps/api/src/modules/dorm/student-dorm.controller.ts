import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { DormService } from './dorm.service';

@Controller('dorm')
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles('student')
export class StudentDormController {
  constructor(private readonly dormService: DormService) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.dormService.self(request.authSession!.userId);
  }

  @Post('reports')
  @UseGuards(CsrfGuard)
  createReport(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.dormService.createSelfReport(body, request.authSession!.userId);
  }
}

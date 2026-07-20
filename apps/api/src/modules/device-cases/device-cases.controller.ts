import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RequirePermissions } from '../../shared/auth/auth.decorators';
import { SessionGuard } from '../../shared/auth/session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { DeviceCasesService } from './device-cases.service';

const deviceCaseCommandBodySchema = z.object({
  command: z.enum(['open', 'close']),
});

function requireActorId(request: AuthenticatedRequest) {
  const actorId = request.authSession?.userId;
  if (!actorId || actorId <= 0) {
    throw new BadRequestException('A linked administrator account is required.');
  }
  return actorId;
}

function parseCommandBody(body: unknown) {
  const parsed = deviceCaseCommandBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException('Invalid device case command.');
  }
  return parsed.data;
}

@Controller('admin/device-cases')
@UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
@RequirePermissions('devices.manage')
export class DeviceCasesController {
  constructor(private readonly deviceCasesService: DeviceCasesService) {}

  @Get()
  list() {
    return this.deviceCasesService.list();
  }

  @Get(':id/commands')
  commands(@Param('id') id: string) {
    return this.deviceCasesService.commands(Number(id));
  }

  @Post('commands')
  commandAll(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseCommandBody(body);
    return this.deviceCasesService.commandAll(requireActorId(request), parsed.command);
  }

  @Post(':id/commands')
  commandOne(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseCommandBody(body);
    return this.deviceCasesService.commandOne(Number(id), requireActorId(request), parsed.command);
  }
}

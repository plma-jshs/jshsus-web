import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
const remoteCaseIdBodySchema = z.object({
  id: z.coerce.number().int().min(1),
});
const remoteCaseStatusBodySchema = z
  .object({
    id: z.coerce.number().int().min(1).optional(),
  })
  .optional();

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

@Controller('remote')
export class DeviceCaseRemoteController {
  constructor(private readonly deviceCasesService: DeviceCasesService) {}

  @Get('case')
  cases() {
    return this.deviceCasesService.remoteCases();
  }

  @Post('case2/status')
  async status(@Body() body: unknown) {
    const parsed = remoteCaseStatusBodySchema.safeParse(body);
    const id = parsed.success ? parsed.data?.id : undefined;
    return this.deviceCasesService.markRemoteStatus(id);
  }

  @Post('case2/request')
  async request(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const parsed = remoteCaseIdBodySchema.safeParse(body);
    if (!parsed.success) {
      response.status(422);
      return { success: false, error: 'Invalid case id' };
    }

    const result = await this.deviceCasesService.remoteCaseRequest(parsed.data.id);
    if (!result.success) {
      response.status(403);
    }
    return result;
  }
}

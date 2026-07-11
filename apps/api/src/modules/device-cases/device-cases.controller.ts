import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RequirePermissions } from '../../shared/auth/auth.decorators';
import { SessionGuard } from '../../shared/auth/session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { DeviceCasesService } from './device-cases.service';

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
}

import { Global, Module } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, RolesGuard, PermissionsGuard, CsrfGuard],
  exports: [AuthService, SessionGuard, RolesGuard, PermissionsGuard, CsrfGuard],
})
export class AuthModule {}

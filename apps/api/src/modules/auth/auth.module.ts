import { Global, Module } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { OptionalSessionGuard } from '../../shared/auth/optional-session.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CognitoAuthService } from './cognito-auth.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CognitoAuthService,
    SessionGuard,
    OptionalSessionGuard,
    RolesGuard,
    PermissionsGuard,
    CsrfGuard,
  ],
  exports: [
    AuthService,
    SessionGuard,
    OptionalSessionGuard,
    RolesGuard,
    PermissionsGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}

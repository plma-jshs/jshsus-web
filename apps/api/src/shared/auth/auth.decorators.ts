import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@jshsus/types';

export const ROLES_KEY = 'jshsus:roles';
export const PERMISSIONS_KEY = 'jshsus:permissions';
export const SKIP_CSRF_KEY = 'jshsus:skip-csrf';

export const RequireRoles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

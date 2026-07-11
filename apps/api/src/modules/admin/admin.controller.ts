import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(SessionGuard, RolesGuard, PermissionsGuard, CsrfGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @RequireRoles('system_admin', 'student_affairs_head', 'teacher')
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('audit-logs')
  @RequirePermissions('audit.read')
  auditLogs() {
    return this.adminService.auditLogs();
  }

  @Get('students')
  @RequirePermissions('users.manage')
  students() {
    return this.adminService.students();
  }

  @Post('students')
  @RequirePermissions('users.manage')
  createStudent(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.adminService.createStudent(body, request.authSession?.userId);
  }

  @Put('students/:id')
  @RequirePermissions('users.manage')
  updateStudent(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.updateStudent(Number(id), body, request.authSession?.userId);
  }

  @Get('staff')
  @RequirePermissions('users.manage')
  staff() {
    return this.adminService.staff();
  }

  @Post('staff')
  @RequirePermissions('users.manage')
  createStaff(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.adminService.createStaff(body, request.authSession?.userId);
  }

  @Put('staff/:id')
  @RequirePermissions('users.manage')
  updateStaff(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.updateStaff(Number(id), body, request.authSession?.userId);
  }

  @Get('iam/roles')
  @RequirePermissions('iam.manage')
  roles() {
    return this.adminService.roles();
  }

  @Post('iam/roles')
  @RequirePermissions('iam.manage')
  createRole(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.adminService.createRole(body, request.authSession?.userId);
  }

  @Put('iam/roles/:id')
  @RequirePermissions('iam.manage')
  updateRole(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.adminService.updateRole(Number(id), body, request.authSession?.userId);
  }

  @Get('iam/permissions')
  @RequirePermissions('iam.manage')
  permissions() {
    return this.adminService.permissions();
  }

  @Post('iam/permissions')
  @RequirePermissions('iam.manage')
  createPermission(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.adminService.createPermission(body, request.authSession?.userId);
  }

  @Get('users/:id/roles')
  @RequirePermissions('iam.manage')
  userRoles(@Param('id') id: string) {
    return this.adminService.userRoles(Number(id));
  }

  @Put('users/:id/roles')
  @RequirePermissions('iam.manage')
  assignUserRoles(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.assignUserRoles(Number(id), body, request.authSession?.userId);
  }

  @Get('iam/roles/:id/permissions')
  @RequirePermissions('iam.manage')
  rolePermissions(@Param('id') id: string) {
    return this.adminService.rolePermissions(Number(id));
  }

  @Put('iam/roles/:id/permissions')
  @RequirePermissions('iam.manage')
  assignRolePermissions(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.assignRolePermissions(Number(id), body, request.authSession?.userId);
  }
}

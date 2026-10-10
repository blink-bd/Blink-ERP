import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { NoApiKey } from '@/common/decorators/no-api-key.decorator';
import { UsersService } from './users.service';
import { UserManagementService } from './user-management.service';
import {
  CreateTenantUserDto,
  ResetUserPasswordDto,
  RoleDto,
  UpdateRoleDto,
  UpdateTenantUserDto,
} from './dto/user-management.dto';

@ApiTags('users')
@ApiBearerAuth()
@NoApiKey()
@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly management: UserManagementService
  ) {}

  @Get('me')
  async me(@Request() req) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) return { success: true, data: null };
    return {
      success: true,
      data: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        lastLoginIp: user.lastLoginIp,
        passwordChangedAt: user.passwordChangedAt,
        roles: (user.roles || []).map((role) => ({
          id: role.id,
          name: role.name,
          nameAr: role.nameAr,
          permissions: (role.permissions || []).map((permission) => permission.name),
        })),
      },
    };
  }

  @Get()
  @RequirePermission('users.view')
  async list(@Request() req) {
    return { success: true, data: await this.management.listUsers(req.tenantId) };
  }

  @Post()
  @RequirePermission('users.create')
  async create(@Request() req, @Body() dto: CreateTenantUserDto) {
    const data = await this.management.createUser(req.user, dto, req);
    return { success: true, data, message: 'تم إضافة المستخدم' };
  }

  @Put(':id')
  @RequirePermission('users.update')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantUserDto
  ) {
    const data = await this.management.updateUser(req.user, id, dto, req);
    return { success: true, data, message: 'تم تحديث المستخدم' };
  }

  @Post(':id/reset-password')
  @RequirePermission('users.update')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async resetPassword(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto
  ) {
    await this.management.resetPassword(req.user, id, dto.newPassword, req);
    return { success: true, message: 'تم تغيير كلمة المرور وتسجيل خروج المستخدم من كل الأجهزة' };
  }

  @Post(':id/revoke-sessions')
  @RequirePermission('users.update')
  async revokeSessions(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.management.revokeUserSessions(req.user, id, req);
    return { success: true, message: 'تم تسجيل خروج المستخدم من كل الأجهزة' };
  }

  @Delete(':id')
  @RequirePermission('users.delete')
  async remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.management.deleteUser(req.user, id, req);
    return { success: true, message: 'تم حذف المستخدم' };
  }
}

@ApiTags('roles')
@ApiBearerAuth()
@NoApiKey()
@Controller({ path: 'roles', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly management: UserManagementService) {}

  @Get()
  @RequirePermission('users.view', 'roles.manage')
  async list(@Request() req) {
    return { success: true, data: await this.management.listRoles(req.tenantId) };
  }

  @Get('permissions')
  @RequirePermission('roles.manage')
  async permissions() {
    return { success: true, data: await this.management.listPermissions() };
  }

  @Post()
  @RequirePermission('roles.manage')
  async create(@Request() req, @Body() dto: RoleDto) {
    const data = await this.management.createRole(req.user, dto, req);
    return { success: true, data, message: 'تم إنشاء الدور' };
  }

  @Put(':id')
  @RequirePermission('roles.manage')
  async update(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    const data = await this.management.updateRole(req.user, id, dto, req);
    return { success: true, data, message: 'تم تحديث الدور' };
  }

  @Delete(':id')
  @RequirePermission('roles.manage')
  async remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.management.deleteRole(req.user, id, req);
    return { success: true, message: 'تم حذف الدور' };
  }
}

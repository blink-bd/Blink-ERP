import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
        roles: (user.roles || []).map((role) => ({
          id: role.id,
          name: role.name,
          nameAr: role.nameAr,
          permissions: (role.permissions || []).map((permission) => permission.name),
        })),
      },
    };
  }
}

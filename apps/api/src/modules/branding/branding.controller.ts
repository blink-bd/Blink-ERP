import { Controller, Get, Put, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { BrandingService } from './branding.service';
import { MasterAdminGuard } from '@/modules/master-admin/master-admin.guard';

@ApiTags('branding')
@RequirePermission('branding.view')
@Controller({ path: 'branding', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
@ApiBearerAuth()
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Get()
  async get(@Request() req) {
    const branding = await this.brandingService.getTenantBranding(req.tenantId);
    return { success: true, data: branding };
  }

  // لا يوجد PUT للتاجر عمداً؛ تغيير الهوية البصرية يتم من المدير العام فقط.
}

@ApiTags('admin-branding')
@Controller({ path: 'admin/tenants/:tenantId/branding', version: '1' })
@UseGuards(MasterAdminGuard)
export class AdminBrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Get()
  async get(@Param('tenantId') tenantId: string) {
    const branding = await this.brandingService.getTenantBranding(tenantId);
    return { success: true, data: branding };
  }

  @Put()
  async update(@Param('tenantId') tenantId: string, @Body() dto: Partial<any>) {
    const branding = await this.brandingService.updateBranding(tenantId, dto);
    return { success: true, data: branding, message: 'Branding updated successfully' };
  }
}

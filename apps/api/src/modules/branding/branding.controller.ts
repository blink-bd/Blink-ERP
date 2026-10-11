import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
  Ip,
} from '@nestjs/common';
import { MasterAdminService } from '@/modules/master-admin/master-admin.service';
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
  constructor(
    private readonly brandingService: BrandingService,
    private readonly master: MasterAdminService
  ) {}

  @Get()
  async get(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    await this.master.assertTenantExists(tenantId);
    const branding = await this.brandingService.getTenantBranding(tenantId);
    return { success: true, data: branding };
  }

  @Put()
  async update(
    @Request() req,
    @Ip() ip: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: Partial<any>
  ) {
    await this.master.assertTenantExists(tenantId);
    const branding = await this.brandingService.updateBranding(tenantId, dto);
    await this.master.audit(
      req.masterAdmin.email,
      'TENANT_BRANDING_UPDATED',
      'tenant',
      tenantId,
      {},
      ip
    );
    return { success: true, data: branding, message: 'Branding updated successfully' };
  }
}

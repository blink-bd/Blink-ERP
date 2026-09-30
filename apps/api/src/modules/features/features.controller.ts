import { Controller, Get, Put, Body, Param, Ip, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesService } from './features.service';
import { MasterAdminGuard } from '@/modules/master-admin/master-admin.guard';
import { MasterAdminService } from '@/modules/master-admin/master-admin.service';
import { IsArray, IsBoolean, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

@ApiTags('features')
@Controller({ path: 'tenants/features', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
@ApiBearerAuth()
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get()
  async getMyFeatures(@Request() req) {
    const features = await this.featuresService.getTenantFeatures(req.tenantId);
    return { success: true, data: features };
  }
}

class FeatureToggleDto {
  @IsUUID() featureId: string;
  @IsBoolean() isEnabled: boolean;
}

class UpdateTenantFeaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureToggleDto)
  features: FeatureToggleDto[];
}

@ApiTags('admin-features')
@ApiBearerAuth()
@Controller({ path: 'admin/tenants/:tenantId/features', version: '1' })
@UseGuards(MasterAdminGuard)
export class AdminFeaturesController {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly master: MasterAdminService
  ) {}

  @Get()
  async list(@Param('tenantId') tenantId: string) {
    return { success: true, data: await this.featuresService.getAllWithStatus(tenantId) };
  }

  @Put()
  async update(@Request() req, @Ip() ip: string, @Param('tenantId') tenantId: string, @Body() dto: UpdateTenantFeaturesDto) {
    for (const f of dto.features) {
      await this.featuresService.setFeatureStatus(tenantId, f.featureId, f.isEnabled);
    }
    await this.master.audit(req.masterAdmin.email, 'TENANT_FEATURES_UPDATED', 'tenant', tenantId, dto, ip);
    return { success: true, data: await this.featuresService.getAllWithStatus(tenantId), message: 'تم تحديث ميزات التاجر بنجاح' };
  }
}

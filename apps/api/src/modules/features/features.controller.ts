import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Ip,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesService, FeatureChange } from './features.service';
import { MasterAdminGuard } from '@/modules/master-admin/master-admin.guard';
import { MasterAdminService } from '@/modules/master-admin/master-admin.service';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
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
    return {
      success: true,
      data: features.map((f) => ({ id: f.id, code: f.code, name: f.name, nameAr: f.nameAr })),
    };
  }
}

class FeatureToggleDto {
  @IsUUID() featureId: string;
  @IsBoolean() isEnabled: boolean;
  /** اختياري: تاريخ انتهاء الميزة (فترة تجربة أو بيع لمدة محددة). null = بدون انتهاء */
  @IsOptional() @IsDateString() expiresAt?: string | null;
}

class UpdateTenantFeaturesDto {
  @IsArray()
  @ArrayMaxSize(50)
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
  async list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    await this.master.assertTenantExists(tenantId);
    return { success: true, data: await this.featuresService.getAllWithStatus(tenantId) };
  }

  @Put()
  async update(
    @Request() req,
    @Ip() ip: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantFeaturesDto
  ) {
    await this.master.assertTenantExists(tenantId);
    const changes: FeatureChange[] = [];
    for (const f of dto.features) {
      changes.push(
        ...(await this.featuresService.toggleWithDependencies(tenantId, f.featureId, f.isEnabled, {
          expiresAt:
            f.expiresAt === undefined ? undefined : f.expiresAt ? new Date(f.expiresAt) : null,
          actorId: req.masterAdmin.id,
        }))
      );
    }
    await this.master.audit(
      req.masterAdmin.email,
      'TENANT_FEATURES_UPDATED',
      'tenant',
      tenantId,
      { requested: dto.features, applied: changes },
      ip
    );
    return {
      success: true,
      data: await this.featuresService.getAllWithStatus(tenantId),
      changes,
      message: 'تم تحديث ميزات التاجر بنجاح',
    };
  }
}

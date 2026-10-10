import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { NoApiKey } from '@/common/decorators/no-api-key.decorator';
import { ApiKeysService, API_ACCESS_FEATURE } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { API_KEY_GRANTABLE_PERMISSIONS } from './api-keys.constants';

@ApiTags('api-keys')
@ApiBearerAuth()
@NoApiKey()
@RequireFeature(API_ACCESS_FEATURE)
@RequirePermission('api_keys.manage')
@Controller({ path: 'api-keys', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  async list(@Request() req) {
    return {
      success: true,
      data: await this.service.list(req.tenantId),
      meta: { grantablePermissions: API_KEY_GRANTABLE_PERMISSIONS },
    };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateApiKeyDto) {
    const data = await this.service.create(req.tenantId, dto, req.user, req);
    return {
      success: true,
      data,
      message: 'تم إنشاء المفتاح. انسخه الآن — لن يظهر مرة أخرى',
    };
  }

  @Delete(':id')
  async revoke(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.revoke(req.tenantId, id, req.user.id, req);
    return { success: true, data, message: 'تم إلغاء المفتاح نهائياً' };
  }
}

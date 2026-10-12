import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  assertWarehouseAllowed,
  resolveBranchForWrite,
  scopeOf,
} from '@/common/utils/access-scope';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@ApiTags('purchases')
@ApiBearerAuth()
@RequirePermission('purchases.view')
@RequireFeature('purchases')
@Controller({ path: 'purchases', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  async findAll(@Request() req, @Query('page') page?: number, @Query('limit') limit?: number) {
    const result = await this.purchasesService.findAll(req.tenantId, page, limit, scopeOf(req));
    return { success: true, ...result };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.purchasesService.assertInScope(req.tenantId, id, scopeOf(req));
    return { success: true, data: await this.purchasesService.findById(req.tenantId, id) };
  }

  @Post()
  @RequirePermission('purchases.create')
  async create(@Request() req, @Body() dto: CreatePurchaseDto) {
    const scope = scopeOf(req);
    // الاستلام لازم يكون في مخزن مسموح للمستخدم (فرع الفاتورة = فرع المخزن).
    assertWarehouseAllowed(scope, dto.warehouseId);
    const purchase = await this.purchasesService.create(
      req.tenantId,
      dto,
      req.user.id,
      resolveBranchForWrite(scope, null, req.user.branchId) || undefined
    );
    return { success: true, data: purchase, message: 'تم إنشاء أمر الشراء بنجاح' };
  }
}

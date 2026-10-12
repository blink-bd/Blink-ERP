import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  GoneException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { InventoryService } from './inventory.service';
import { WarehousesService } from './warehouses.service';
import { AdjustInventoryDto } from './dto/inventory-movement.dto';
import { assertWarehouseInWorkingScope, scopeOf } from '@/common/utils/access-scope';

@ApiTags('inventory')
@ApiBearerAuth()
@RequirePermission('inventory.view')
@Controller({ path: 'inventory', version: '1' })
@RequireFeature('inventory')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly warehousesService: WarehousesService
  ) {}

  /**
   * مخزون فرع/مخزن العمل الحالي؛ لو المستخدم شغال على «كل الفروع» بيظهر المخزون
   * في كل المخازن المسموح له بيها.
   */
  @Get()
  async summary(
    @Request() req,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string
  ) {
    const data = await this.inventoryService.getSummary(req.tenantId, {
      warehouseId,
      warehouseIds: scopeOf(req).warehouseIds,
      search,
      categoryId,
    });
    return { success: true, data };
  }

  @Get('transactions')
  async transactions(
    @Request() req,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string
  ) {
    const data = await this.inventoryService.getTransactions(
      req.tenantId,
      productId,
      warehouseId,
      scopeOf(req).warehouseIds
    );
    return { success: true, data };
  }

  @Post('adjust')
  @RequirePermission('inventory.adjust')
  async adjust(@Request() req, @Body() dto: AdjustInventoryDto) {
    await this.warehousesService.findUsable(req.tenantId, dto.warehouseId);
    assertWarehouseInWorkingScope(scopeOf(req), dto.warehouseId);
    const transaction = await this.inventoryService.adjustManual(
      req.tenantId,
      dto.productId,
      dto.warehouseId,
      dto.quantity,
      dto.reason,
      req.user?.id
    );
    return { success: true, data: transaction, message: 'تم تعديل المخزون بنجاح' };
  }

  @Post('transfer')
  @RequirePermission('inventory.transfer')
  @RequireFeature('warehouses')
  transfer() {
    // Immediate transfers bypass the required request/approval workflow.
    throw new GoneException('استخدم POST /inventory/transfers لإنشاء طلب تحويل يحتاج إلى موافقة');
  }
}

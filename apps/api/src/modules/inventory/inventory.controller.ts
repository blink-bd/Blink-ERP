import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller({ path: 'inventory', version: '1' })
@RequireFeature('inventory')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async summary(
    @Request() req,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string
  ) {
    const data = await this.inventoryService.getSummary(req.tenantId, {
      warehouseId,
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
    const data = await this.inventoryService.getTransactions(req.tenantId, productId, warehouseId);
    return { success: true, data };
  }

  @Post('adjust')
  async adjust(
    @Request() req,
    @Body() dto: { productId: string; warehouseId: string; quantity: number; reason: string }
  ) {
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
  async transfer(
    @Request() req,
    @Body()
    dto: { productId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number }
  ) {
    const result = await this.inventoryService.transfer(
      req.tenantId,
      dto.productId,
      dto.fromWarehouseId,
      dto.toWarehouseId,
      dto.quantity,
      req.user?.id
    );
    return { success: true, data: result, message: 'تم نقل المخزون بنجاح' };
  }
}

import { Controller, Get, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
@Controller({ path: 'purchases', version: '1' })
@RequireFeature('purchases')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  async findAll(@Request() req, @Query('page') page?: number, @Query('limit') limit?: number) {
    const result = await this.purchasesService.findAll(
      req.tenantId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.purchasesService.findById(req.tenantId, id) };
  }

  @Post()
  @RequirePermission('purchases.create')
  async create(@Request() req, @Body() dto: CreatePurchaseDto) {
    const purchase = await this.purchasesService.create(req.tenantId, dto, req.user.id);
    return { success: true, data: purchase, message: 'تم إنشاء أمر الشراء بنجاح' };
  }
}

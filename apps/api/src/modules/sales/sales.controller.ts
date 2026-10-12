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
  ForbiddenException,
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
import { FeaturesService } from '@/modules/features/features.service';
import { getFeatureDefinition } from '@/modules/features/features.catalog';
import { SalesService } from './sales.service';
import { AddSalePaymentDto, CreateSaleDto, VoidSaleDto } from './dto/create-sale.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ResolveReturnItemDto } from './dto/resolve-return-item.dto';

@ApiTags('sales')
@ApiBearerAuth()
@RequirePermission('sales.view')
@Controller({ path: 'sales', version: '1' })
@RequireFeature('sales')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly featuresService: FeaturesService
  ) {}

  private async assertFeature(tenantId: string, code: string) {
    if (!(await this.featuresService.tenantHasFeature(tenantId, code))) {
      const name = getFeatureDefinition(code)?.nameAr || code;
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        feature: code,
        message: `ميزة "${name}" غير مفعّلة لحسابك. تواصل مع الإدارة لتفعيلها`,
      });
    }
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string
  ) {
    const result = await this.salesService.findAll(
      req.tenantId,
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search,
        status,
      },
      scopeOf(req)
    );
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('payment-methods')
  async paymentMethods(@Request() req) {
    return { success: true, data: await this.salesService.getDefaultPaymentMethods(req.tenantId) };
  }

  @Get('returns')
  @RequireFeature('return_disposition')
  async findReturns(@Request() req, @Query('status') status?: string) {
    return {
      success: true,
      data: await this.salesService.findReturns(req.tenantId, status, scopeOf(req)),
    };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.salesService.assertInScope('sales', req.tenantId, id, scopeOf(req));
    return { success: true, data: await this.salesService.findById(req.tenantId, id) };
  }

  @Post()
  @RequirePermission('sales.create')
  async create(@Request() req, @Body() dto: CreateSaleDto) {
    if (req.user?.authType !== 'api_key') await this.assertFeature(req.tenantId, 'pos');
    const scope = scopeOf(req);
    // البيع لازم يكون من مخزن مسموح للمستخدم (فرع الفاتورة = فرع المخزن).
    assertWarehouseAllowed(scope, dto.warehouseId);
    const sale = await this.salesService.create(
      req.tenantId,
      dto,
      req.user.id,
      resolveBranchForWrite(scope, null, req.user.branchId) || undefined
    );
    return { success: true, data: sale, message: 'تم إنشاء الفاتورة بنجاح' };
  }

  @Post(':id/payments')
  @RequirePermission('sales.payment')
  async addPayment(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSalePaymentDto
  ) {
    await this.salesService.assertInScope('sales', req.tenantId, id, scopeOf(req));
    const result = await this.salesService.addPayment(
      req.tenantId,
      id,
      dto.methodId,
      dto.amount,
      dto.referenceNumber,
      req.user.id
    );
    return { success: true, data: result, message: 'تم إضافة الدفعة بنجاح' };
  }

  @Post(':id/void')
  @RequirePermission('sales.void')
  async void(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidSaleDto) {
    await this.salesService.assertInScope('sales', req.tenantId, id, scopeOf(req));
    await this.salesService.voidSale(req.tenantId, id, dto.reason, req.user.id);
    return { success: true, message: 'تم إلغاء الفاتورة بنجاح' };
  }

  @Post(':id/return')
  @RequirePermission('sales.return')
  @RequireFeature('returns', 'return_disposition')
  async createReturn(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReturnDto
  ) {
    await this.salesService.assertInScope('sales', req.tenantId, id, scopeOf(req));
    const result = await this.salesService.createReturn(req.tenantId, id, dto, req.user.id);
    return { success: true, data: result, message: 'تم تسجيل الاسترجاع وإرساله إلى الفحص' };
  }

  @Post('returns/:returnId/items/:itemId/disposition')
  @RequirePermission('sales.return')
  @RequireFeature('return_disposition')
  async resolveReturnItem(
    @Request() req,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ResolveReturnItemDto
  ) {
    await this.salesService.assertInScope('sale_returns', req.tenantId, returnId, scopeOf(req));
    return {
      success: true,
      data: await this.salesService.resolveReturnItem(
        req.tenantId,
        returnId,
        itemId,
        req.user.id,
        dto
      ),
      message: 'تم حفظ قرار فحص المرتجع',
    };
  }
}

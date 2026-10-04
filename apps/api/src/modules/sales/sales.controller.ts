import { Controller, Get, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateReturnDto } from './dto/create-return.dto';

@ApiTags('sales')
@ApiBearerAuth()
@Controller({ path: 'sales', version: '1' })
@RequireFeature('sales')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string
  ) {
    const result = await this.salesService.findAll(req.tenantId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      status,
    });
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('payment-methods')
  async paymentMethods(@Request() req) {
    return { success: true, data: await this.salesService.getDefaultPaymentMethods(req.tenantId) };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.salesService.findById(req.tenantId, id) };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateSaleDto) {
    const sale = await this.salesService.create(req.tenantId, dto, req.user.id);
    return { success: true, data: sale, message: 'تم إنشاء الفاتورة بنجاح' };
  }

  @Post(':id/payments')
  async addPayment(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: { methodId: string; amount: number; referenceNumber?: string }
  ) {
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
  async void(@Request() req, @Param('id') id: string, @Body() dto: { reason: string }) {
    await this.salesService.voidSale(req.tenantId, id, dto.reason, req.user.id);
    return { success: true, message: 'تم إلغاء الفاتورة بنجاح' };
  }

  @Post(':id/return')
  async createReturn(@Request() req, @Param('id') id: string, @Body() dto: CreateReturnDto) {
    const result = await this.salesService.createReturn(req.tenantId, id, dto, req.user.id);
    return { success: true, data: result, message: 'تم تسجيل الاسترجاع وتحديث المخزون بنجاح' };
  }
}

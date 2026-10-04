import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@RequireFeature('customers')
@Controller({ path: 'customers', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Request() req, @Query('search') search?: string) {
    const result = await this.customersService.findAll(req.tenantId, search);
    return { success: true, data: result.data, meta: { totalOwed: result.totalOwed } };
  }

  @Get('search')
  async quickSearch(@Request() req, @Query('q') q?: string) {
    return { success: true, data: await this.customersService.search(req.tenantId, q) };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.customersService.findById(req.tenantId, id) };
  }

  @Get(':id/statement')
  async statement(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.customersService.statement(req.tenantId, id) };
  }

  @Post()
  async create(@Request() req, @Body() dto: any) {
    const customer = await this.customersService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: customer, message: 'تم إضافة العميل بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const customer = await this.customersService.update(req.tenantId, id, {
      ...dto,
      updatedBy: req.user?.id,
    } as any);
    return { success: true, data: customer, message: 'تم تحديث بيانات العميل بنجاح' };
  }

  @Post(':id/payments')
  async collectPayment(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: { amount: number; methodId: string; notes?: string }
  ) {
    const customer = await this.customersService.collectPayment(
      req.tenantId,
      id,
      dto.amount,
      dto.methodId,
      dto.notes,
      req.user.id
    );
    return { success: true, data: customer, message: 'تم تسجيل السداد بنجاح' };
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    await this.customersService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف العميل بنجاح' };
  }
}

import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller({ path: 'customers', version: '1' })
@RequireFeature('customers')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Request() req, @Query('search') search?: string) {
    return { success: true, data: await this.customersService.findAll(req.tenantId, search) };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.customersService.findById(req.tenantId, id) };
  }

  @Post()
  async create(@Request() req, @Body() dto: any) {
    const customer = await this.customersService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: customer, message: 'تم إضافة العميل بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const customer = await this.customersService.update(req.tenantId, id, dto);
    return { success: true, data: customer, message: 'تم تحديث بيانات العميل بنجاح' };
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    await this.customersService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف العميل بنجاح' };
  }
}

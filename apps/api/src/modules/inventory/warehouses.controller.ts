import { Controller, Get, Post, Put, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiBearerAuth()
@Controller({ path: 'warehouses', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  async findAll(@Request() req) {
    return { success: true, data: await this.warehousesService.findAll(req.tenantId) };
  }

  @Post()
  async create(@Request() req, @Body() dto: any) {
    const warehouse = await this.warehousesService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: warehouse, message: 'تم إضافة المخزن بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const warehouse = await this.warehousesService.update(req.tenantId, id, dto);
    return { success: true, data: warehouse, message: 'تم تحديث المخزن بنجاح' };
  }
}

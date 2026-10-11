import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { WarehouseDto, UpdateWarehouseDto } from './dto/location.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiBearerAuth()
@RequirePermission('warehouses.view')
@Controller({ path: 'warehouses', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  async findAll(@Request() req, @Query('all') all?: string) {
    // all=1 يعرض كل المخازن (للإعدادات) حتى لو ميزة المخازن المتعددة مقفولة
    const includeAll = all === '1' || all === 'true';
    return { success: true, data: await this.warehousesService.findAll(req.tenantId, includeAll) };
  }

  @Post()
  @RequirePermission('warehouses.manage')
  async create(@Request() req, @Body() dto: WarehouseDto) {
    const warehouse = await this.warehousesService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: warehouse, message: 'تم إضافة المخزن بنجاح' };
  }

  @Put(':id')
  @RequirePermission('warehouses.manage')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto
  ) {
    const warehouse = await this.warehousesService.update(req.tenantId, id, dto, req.user?.id);
    return { success: true, data: warehouse, message: 'تم تحديث المخزن بنجاح' };
  }
}

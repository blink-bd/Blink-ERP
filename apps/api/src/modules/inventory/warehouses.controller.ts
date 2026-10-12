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
  ForbiddenException,
} from '@nestjs/common';
import { WarehouseDto, UpdateWarehouseDto } from './dto/location.dto';
import { isBranchAllowed, isWarehouseAllowed, scopeOf } from '@/common/utils/access-scope';
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
    const includeAll = all === '1' || all === 'true';
    // المستخدم المقيد بيشوف المخازن المسموح له بيها بس.
    const scope = scopeOf(req);
    const warehouses = await this.warehousesService.findAll(req.tenantId, includeAll);
    return { success: true, data: warehouses.filter((w) => isWarehouseAllowed(scope, w.id)) };
  }

  @Post()
  @RequirePermission('warehouses.manage')
  async create(@Request() req, @Body() dto: WarehouseDto) {
    if (!scopeOf(req).accessAll) {
      throw new ForbiddenException(
        'إضافة مخازن متاحة بس للمستخدمين اللي ليهم صلاحية على كل الفروع'
      );
    }
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
    if (!isWarehouseAllowed(scopeOf(req), id)) {
      throw new ForbiddenException('مش مسموح لك تعدّل المخزن ده');
    }
    if ((dto as any).branchId && !isBranchAllowed(scopeOf(req), (dto as any).branchId)) {
      throw new ForbiddenException('مش مسموح لك تربط المخزن بالفرع ده');
    }
    const warehouse = await this.warehousesService.update(req.tenantId, id, dto, req.user?.id);
    return { success: true, data: warehouse, message: 'تم تحديث المخزن بنجاح' };
  }
}

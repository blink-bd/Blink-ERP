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
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { SuppliersService } from './suppliers.service';
import { SupplierSettlementDto } from './dto/supplier-settlement.dto';

@ApiTags('suppliers')
@ApiBearerAuth()
@RequireFeature('suppliers')
@RequirePermission('suppliers.view')
@Controller({ path: 'suppliers', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(@Request() req, @Query('search') search?: string) {
    const result = await this.suppliersService.findAll(req.tenantId, search);
    return { success: true, data: result.data, meta: { totalOwed: result.totalOwed } };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.suppliersService.findById(req.tenantId, id) };
  }

  @Get(':id/statement')
  async statement(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.suppliersService.statement(req.tenantId, id) };
  }

  @Post()
  @RequirePermission('suppliers.create')
  async create(@Request() req, @Body() dto: any) {
    const supplier = await this.suppliersService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: supplier, message: 'تم إضافة المورد بنجاح' };
  }

  @Put(':id')
  @RequirePermission('suppliers.update')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const supplier = await this.suppliersService.update(req.tenantId, id, {
      ...dto,
      updatedBy: req.user?.id,
    } as any);
    return { success: true, data: supplier, message: 'تم تحديث بيانات المورد بنجاح' };
  }

  @Post(':id/settle')
  @RequirePermission('suppliers.settle')
  async settle(@Request() req, @Param('id') id: string, @Body() dto: SupplierSettlementDto) {
    const result = await this.suppliersService.settle(
      req.tenantId,
      id,
      dto.amount,
      dto.method,
      dto.notes,
      req.user?.id
    );
    return { success: true, data: result, message: 'تم تسجيل السداد بنجاح' };
  }

  @Delete(':id')
  @RequirePermission('suppliers.delete')
  async remove(@Request() req, @Param('id') id: string) {
    await this.suppliersService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف المورد بنجاح' };
  }
}

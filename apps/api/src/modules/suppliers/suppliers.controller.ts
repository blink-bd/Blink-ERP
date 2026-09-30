import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller({ path: 'suppliers', version: '1' })
@RequireFeature('suppliers')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(@Request() req, @Query('search') search?: string) {
    return { success: true, data: await this.suppliersService.findAll(req.tenantId, search) };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return { success: true, data: await this.suppliersService.findById(req.tenantId, id) };
  }

  @Post()
  async create(@Request() req, @Body() dto: any) {
    const supplier = await this.suppliersService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: supplier, message: 'تم إضافة المورد بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const supplier = await this.suppliersService.update(req.tenantId, id, dto);
    return { success: true, data: supplier, message: 'تم تحديث بيانات المورد بنجاح' };
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    await this.suppliersService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف المورد بنجاح' };
  }
}

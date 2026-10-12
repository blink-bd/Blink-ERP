import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { BrandsService } from './brands.service';

@ApiTags('brands')
@ApiBearerAuth()
@RequirePermission('brands.view')
@Controller({ path: 'brands', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  async findAll(@Request() req) {
    const brands = await this.brandsService.findAll(req.tenantId);
    return { success: true, data: brands };
  }

  @Post()
  @RequirePermission('brands.manage')
  async create(@Request() req, @Body() dto: any) {
    const brand = await this.brandsService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: brand, message: 'تم إضافة العلامة التجارية بنجاح' };
  }

  @Put(':id')
  @RequirePermission('brands.manage')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const brand = await this.brandsService.update(req.tenantId, id, dto);
    return { success: true, data: brand, message: 'تم تحديث العلامة التجارية بنجاح' };
  }

  @Delete(':id')
  @RequirePermission('brands.manage')
  async remove(@Request() req, @Param('id') id: string) {
    await this.brandsService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف العلامة التجارية بنجاح' };
  }
}

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
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller({ path: 'categories', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(@Request() req) {
    const categories = await this.categoriesService.findAll(req.tenantId);
    return { success: true, data: categories };
  }

  @Post()
  async create(@Request() req, @Body() dto: any) {
    const category = await this.categoriesService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: category, message: 'تم إضافة الفئة بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const category = await this.categoriesService.update(req.tenantId, id, dto);
    return { success: true, data: category, message: 'تم تحديث الفئة بنجاح' };
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    await this.categoriesService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف الفئة بنجاح' };
  }
}

import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@RequirePermission('expenses.view')
@Controller({ path: 'expenses', version: '1' })
@RequireFeature('expenses')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return {
      success: true,
      data: await this.expensesService.findAll(req.tenantId, startDate, endDate),
    };
  }

  @Get('summary')
  async summary(@Request() req, @Query('period') period?: 'day' | 'month' | 'year') {
    return { success: true, data: await this.expensesService.summary(req.tenantId, period) };
  }

  @Get('categories')
  async categories(@Request() req) {
    return { success: true, data: await this.expensesService.findCategories(req.tenantId) };
  }

  @Post('categories')
  @RequirePermission('expenses.manage')
  async createCategory(@Request() req, @Body() dto: any) {
    const category = await this.expensesService.createCategory(req.tenantId, dto);
    return { success: true, data: category, message: 'تم إضافة فئة المصروف بنجاح' };
  }

  @Post()
  @RequirePermission('expenses.create')
  async create(@Request() req, @Body() dto: any) {
    const expense = await this.expensesService.create(req.tenantId, dto, req.user.id);
    return { success: true, data: expense, message: 'تم تسجيل المصروف بنجاح' };
  }
}

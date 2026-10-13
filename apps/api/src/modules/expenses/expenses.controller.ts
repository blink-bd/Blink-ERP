import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  intersectBranchFilter,
  isBranchAllowed,
  resolveBranchForWrite,
  scopeOf,
} from '@/common/utils/access-scope';
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
    @Query('endDate') endDate?: string,
    @Query('branchIds') branchIds?: string
  ) {
    const selected = branchIds
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return {
      success: true,
      data: await this.expensesService.findAll(
        req.tenantId,
        startDate,
        endDate,
        intersectBranchFilter(scopeOf(req), selected)
      ),
    };
  }

  @Get('summary')
  async summary(
    @Request() req,
    @Query('period') period?: 'day' | 'month' | 'year',
    @Query('branchIds') branchIds?: string
  ) {
    const selected = branchIds
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return {
      success: true,
      data: await this.expensesService.summary(
        req.tenantId,
        period,
        intersectBranchFilter(scopeOf(req), selected)
      ),
    };
  }

  @Get('categories')
  async categories(@Request() req) {
    return { success: true, data: await this.expensesService.findCategories(req.tenantId) };
  }

  @Post('categories')
  @RequireFeature('expenses.categories')
  @RequirePermission('expenses.manage')
  async createCategory(@Request() req, @Body() dto: any) {
    const category = await this.expensesService.createCategory(req.tenantId, dto);
    return { success: true, data: category, message: 'تم إضافة فئة المصروف بنجاح' };
  }

  @Post()
  @RequirePermission('expenses.create')
  async create(@Request() req, @Body() dto: any) {
    const scope = scopeOf(req);
    if (dto?.branchId && !isBranchAllowed(scope, dto.branchId)) {
      throw new ForbiddenException('مش مسموح لك تسجل مصروف على الفرع ده');
    }
    const branchId = dto?.branchId || resolveBranchForWrite(scope, null, req.user.branchId);
    const expense = await this.expensesService.create(
      req.tenantId,
      { ...dto, branchId: branchId || undefined },
      req.user.id
    );
    return { success: true, data: expense, message: 'تم تسجيل المصروف بنجاح' };
  }
}

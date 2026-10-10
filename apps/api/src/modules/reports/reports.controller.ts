import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { ReportsService } from './reports.service';
import { AdvancedReportsService, parseRange } from './advanced-reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@RequirePermission('reports.view')
@Controller({ path: 'reports', version: '1' })
@RequireFeature('reports')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  async sales(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    const data = await this.reportsService.salesReport(req.tenantId, startDate, endDate);
    return { success: true, data };
  }

  @Get('inventory')
  async inventory(@Request() req) {
    const data = await this.reportsService.inventoryReport(req.tenantId);
    return { success: true, data };
  }

  @Get('purchases')
  async purchases(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return {
      success: true,
      data: await this.reportsService.purchasesReport(req.tenantId, startDate, endDate),
    };
  }

  @Get('expenses')
  async expenses(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return {
      success: true,
      data: await this.reportsService.expensesReport(req.tenantId, startDate, endDate),
    };
  }

  @Get('profit-loss')
  @RequireFeature('advanced_reports')
  @RequirePermission('advanced_reports.view')
  async profitLoss(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    const data = await this.reportsService.profitLossReport(req.tenantId, startDate, endDate);
    return { success: true, data };
  }
}

/**
 * التقارير المتقدمة — تتطلب ميزتي reports + advanced_reports وصلاحية advanced_reports.view.
 */
@ApiTags('reports')
@ApiBearerAuth()
@RequirePermission('advanced_reports.view')
@Controller({ path: 'reports/advanced', version: '1' })
@RequireFeature('reports', 'advanced_reports')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class AdvancedReportsController {
  constructor(private readonly advanced: AdvancedReportsService) {}

  @Get('product-profitability')
  async productProfitability(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const data = await this.advanced.productProfitability(
      req.tenantId,
      parseRange(startDate, endDate)
    );
    return { success: true, data };
  }

  @Get('by-cashier')
  async byCashier(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return {
      success: true,
      data: await this.advanced.byCashier(req.tenantId, parseRange(startDate, endDate)),
    };
  }

  @Get('by-payment-method')
  async byPaymentMethod(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return {
      success: true,
      data: await this.advanced.byPaymentMethod(req.tenantId, parseRange(startDate, endDate)),
    };
  }

  @Get('inventory-valuation')
  async inventoryValuation(@Request() req) {
    return { success: true, data: await this.advanced.inventoryValuation(req.tenantId) };
  }

  @Get('dead-stock')
  async deadStock(@Request() req, @Query('days') days?: string) {
    const d = Math.min(Math.max(parseInt(days || '60', 10) || 60, 7), 730);
    return { success: true, data: await this.advanced.deadStock(req.tenantId, d) };
  }

  @Get('sales-heatmap')
  async heatmap(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return {
      success: true,
      data: await this.advanced.salesHeatmap(req.tenantId, parseRange(startDate, endDate)),
    };
  }

  @Get('top-customers')
  async topCustomers(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return {
      success: true,
      data: await this.advanced.topCustomers(req.tenantId, parseRange(startDate, endDate)),
    };
  }
}

import { BadRequestException, Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { ReportsService } from './reports.service';
import { BranchAnalyticsService } from './branch-analytics.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
@RequireFeature('reports')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly branchAnalytics: BranchAnalyticsService
  ) {}

  @Get('sales')
  async sales(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    const data = await this.reportsService.salesReport(req.tenantId, startDate, endDate);
    return { success: true, data };
  }

  @Get('branches')
  @RequireFeature('branch_analytics')
  async branches(
    @Request() req,
    @Query('branchIds') branchIds?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const selected = branchIds
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (selected?.some((id) => !isUUID(id))) throw new BadRequestException('معرّف فرع غير صالح');
    if (startDate && Number.isNaN(Date.parse(startDate)))
      throw new BadRequestException('تاريخ البداية غير صالح');
    if (endDate && Number.isNaN(Date.parse(endDate)))
      throw new BadRequestException('تاريخ النهاية غير صالح');
    if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }
    return {
      success: true,
      data: await this.branchAnalytics.report(req.tenantId, {
        branchIds: selected,
        startDate,
        endDate,
      }),
    };
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
  async profitLoss(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    const data = await this.reportsService.profitLossReport(req.tenantId, startDate, endDate);
    return { success: true, data };
  }
}

import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
@RequireFeature('reports')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  async sales(@Request() req, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const data = await this.reportsService.salesReport(req.tenantId, startDate, endDate);
    return { success: true, data };
  }

  @Get('inventory')
  async inventory(@Request() req) {
    const data = await this.reportsService.inventoryReport(req.tenantId);
    return { success: true, data };
  }

  @Get('purchases')
  async purchases(@Request() req, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return { success: true, data: await this.reportsService.purchasesReport(req.tenantId, startDate, endDate) };
  }

  @Get('expenses')
  async expenses(@Request() req, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return { success: true, data: await this.reportsService.expensesReport(req.tenantId, startDate, endDate) };
  }

  @Get('profit-loss')
  @RequireFeature('advanced_reports')
  async profitLoss(@Request() req, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const data = await this.reportsService.profitLossReport(req.tenantId, startDate, endDate);
    return { success: true, data };
  }
}

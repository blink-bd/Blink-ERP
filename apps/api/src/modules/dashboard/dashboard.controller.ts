import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { scopeOf } from '@/common/utils/access-scope';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesService } from '@/modules/features/features.service';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@RequirePermission('dashboard.view')
@RequireFeature('dashboard')
@Controller({ path: 'dashboard', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly featuresService: FeaturesService
  ) {}

  @Get('summary')
  async summary(@Request() req) {
    const data: Record<string, unknown> = await this.dashboardService.getSummary(
      req.tenantId,
      scopeOf(req)
    );
    // كروت المديونيات زرار يقدر المدير العام يقفله للتاجر.
    if (!(await this.featuresService.tenantHasFeature(req.tenantId, 'dashboard.balances'))) {
      delete data.customerInvoices;
      delete data.supplierInvoices;
    }
    return { success: true, data };
  }
}

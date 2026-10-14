import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { CreateMaintenanceInvoiceDto } from './dto/create-maintenance-invoice.dto';
import { MaintenanceService } from './maintenance.service';
import {
  assertRowAllowed,
  isBranchAllowed,
  resolveBranchForWrite,
  scopeOf,
} from '@/common/utils/access-scope';

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller({ path: 'maintenance', version: '1' })
@RequireFeature('maintenance_management')
@RequirePermission('maintenance.view')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  @Get()
  async list(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchIds') branchIds?: string
  ) {
    const selectedBranches = branchIds
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const scope = scopeOf(req);
    if (selectedBranches?.some((id) => !isBranchAllowed(scope, id))) {
      throw new ForbiddenException('مش مسموح لك تشوف بيانات الفرع ده');
    }
    return {
      success: true,
      data: await this.maintenance.list(req.tenantId, {
        startDate,
        endDate,
        branchIds: selectedBranches,
        scopeBranchIds: scope.branchIds,
      }),
    };
  }

  /** بيانات إرسال فاتورة الصيانة للعميل واتساب (بتكلفة الصيانة اللي دفعها بس). */
  @Get(':id/share')
  @RequireFeature('maintenance.share')
  async share(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await assertRowAllowed(
      this.dataSource.manager,
      'maintenance_invoices',
      req.tenantId,
      id,
      scopeOf(req)
    );
    return { success: true, data: await this.maintenance.getShareInfo(req.tenantId, id) };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await assertRowAllowed(
      this.dataSource.manager,
      'maintenance_invoices',
      req.tenantId,
      id,
      scopeOf(req)
    );
    return { success: true, data: await this.maintenance.findById(req.tenantId, id) };
  }

  @Post()
  @RequirePermission('maintenance.create')
  async create(@Request() req, @Body() dto: CreateMaintenanceInvoiceDto) {
    const scope = scopeOf(req);
    if (dto.branchId && !isBranchAllowed(scope, dto.branchId)) {
      throw new ForbiddenException('مش مسموح لك تسجل على الفرع ده');
    }
    const invoice = await this.maintenance.create(
      req.tenantId,
      req.user.id,
      resolveBranchForWrite(scope, null, req.user.branchId) ?? undefined,
      dto
    );
    return { success: true, data: invoice, message: 'تم حفظ فاتورة الصيانة بنجاح' };
  }
}

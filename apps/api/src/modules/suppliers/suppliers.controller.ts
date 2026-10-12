import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import {
  intersectBranchFilter,
  isBranchAllowed,
  resolveBranchForWrite,
  scopeOf,
} from '@/common/utils/access-scope';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { SuppliersService } from './suppliers.service';
import { SupplierSettlementDto } from './dto/supplier-settlement.dto';

@ApiTags('suppliers')
@ApiBearerAuth()
@RequireFeature('suppliers')
@RequirePermission('suppliers.view')
@Controller({ path: 'suppliers', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /** فرع تسجيل السداد: المختار (لازم يكون مسموح) ← فرع العمل/الافتراضي. */
  private paymentBranch(req: any, requested?: string): string | undefined {
    const scope = scopeOf(req);
    if (requested) {
      if (!isBranchAllowed(scope, requested)) {
        throw new ForbiddenException('مش مسموح لك تسجل على الفرع ده');
      }
      return requested;
    }
    return resolveBranchForWrite(scope, null, req.user?.branchId) ?? undefined;
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('branchIds') branchIds?: string
  ) {
    const requested = branchIds
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    // الفروع المطلوبة ∩ نطاق العمل؛ من غير طلب = فروع العمل الحالية (أو الكل).
    const selected = intersectBranchFilter(scopeOf(req), requested);
    const result = await this.suppliersService.findAll(req.tenantId, search, selected);
    return { success: true, data: result.data, meta: { totalOwed: result.totalOwed } };
  }

  @Get('payables-limit/status')
  @RequireFeature('supplier_balance_limit')
  async payablesLimitStatus(@Request() req) {
    return {
      success: true,
      data: await this.suppliersService.getSupplierPayablesLimitStatus(req.tenantId),
    };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.suppliersService.findById(req.tenantId, id) };
  }

  @Get(':id/statement')
  async statement(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('branchIds') branchIds?: string
  ) {
    const requested = branchIds
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    // الفروع المطلوبة ∩ نطاق العمل؛ من غير طلب = فروع العمل الحالية (أو الكل).
    const selected = intersectBranchFilter(scopeOf(req), requested);
    return {
      success: true,
      data: await this.suppliersService.statement(req.tenantId, id, selected),
    };
  }

  @Post()
  @RequirePermission('suppliers.create')
  async create(@Request() req, @Body() dto: SupplierDto) {
    const supplier = await this.suppliersService.create(
      req.tenantId,
      dto,
      req.user?.id,
      resolveBranchForWrite(scopeOf(req), null, req.user?.branchId) ?? undefined
    );
    return { success: true, data: supplier, message: 'تم إضافة المورد بنجاح' };
  }

  @Put(':id')
  @RequirePermission('suppliers.update')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto
  ) {
    const supplier = await this.suppliersService.update(req.tenantId, id, {
      ...dto,
      updatedBy: req.user?.id,
      branchId: resolveBranchForWrite(scopeOf(req), null, req.user?.branchId) ?? undefined,
    } as any);
    return { success: true, data: supplier, message: 'تم تحديث بيانات المورد بنجاح' };
  }

  @Post(':id/settle')
  @RequirePermission('suppliers.settle')
  async settle(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierSettlementDto
  ) {
    const result = await this.suppliersService.settle(
      req.tenantId,
      id,
      dto.amount,
      dto.method,
      dto.notes,
      req.user?.id,
      this.paymentBranch(req, dto.branchId)
    );
    return { success: true, data: result, message: 'تم تسجيل السداد بنجاح' };
  }

  @Delete(':id')
  @RequirePermission('suppliers.delete')
  async remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.suppliersService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف المورد بنجاح' };
  }
}

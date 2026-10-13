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
import { CustomerDto, UpdateCustomerDto } from './dto/customer.dto';
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
import { CustomersService } from './customers.service';
import { CustomerPaymentDto } from './dto/customer-payment.dto';

@ApiTags('customers')
@ApiBearerAuth()
@RequireFeature('customers')
@RequirePermission('customers.view')
@Controller({ path: 'customers', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

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
    const result = await this.customersService.findAll(req.tenantId, search, selected);
    return { success: true, data: result.data, meta: { totalOwed: result.totalOwed } };
  }

  @Get('search')
  async quickSearch(@Request() req, @Query('q') q?: string) {
    return { success: true, data: await this.customersService.search(req.tenantId, q) };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.customersService.findById(req.tenantId, id) };
  }

  @Get(':id/statement')
  @RequireFeature('customers.statement')
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
      data: await this.customersService.statement(req.tenantId, id, selected),
    };
  }

  @Post()
  @RequirePermission('customers.create')
  async create(@Request() req, @Body() dto: CustomerDto) {
    const customer = await this.customersService.create(
      req.tenantId,
      dto,
      req.user?.id,
      resolveBranchForWrite(scopeOf(req), null, req.user?.branchId) ?? undefined
    );
    return { success: true, data: customer, message: 'تم إضافة العميل بنجاح' };
  }

  @Put(':id')
  @RequirePermission('customers.update')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto
  ) {
    const customer = await this.customersService.update(req.tenantId, id, {
      ...dto,
      updatedBy: req.user?.id,
      branchId: resolveBranchForWrite(scopeOf(req), null, req.user?.branchId) ?? undefined,
    } as any);
    return { success: true, data: customer, message: 'تم تحديث بيانات العميل بنجاح' };
  }

  @Post(':id/payments')
  @RequireFeature('customers.payments')
  @RequirePermission('customers.payment')
  async collectPayment(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerPaymentDto
  ) {
    const customer = await this.customersService.collectPayment(
      req.tenantId,
      id,
      dto.amount,
      dto.methodId,
      dto.notes,
      req.user.id,
      this.paymentBranch(req, dto.branchId)
    );
    return { success: true, data: customer, message: 'تم تسجيل السداد بنجاح' };
  }

  @Delete(':id')
  @RequireFeature('customers.delete')
  @RequirePermission('customers.delete')
  async remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.customersService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف العميل بنجاح' };
  }
}

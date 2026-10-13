import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { isBranchAllowed, resolveBranchForWrite, scopeOf } from '@/common/utils/access-scope';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { CashRegisterService } from './cash-register.service';

@ApiTags('cash-register')
@ApiBearerAuth()
@RequirePermission('cash_register.view')
@Controller({ path: 'cash-register', version: '1' })
@RequireFeature('cash_register')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class CashRegisterController {
  constructor(private readonly service: CashRegisterService) {}

  @Get('registers')
  async listRegisters(@Request() req) {
    return {
      success: true,
      data: await this.service.findAllRegisters(req.tenantId, scopeOf(req)),
    };
  }

  @Post('registers')
  @RequireFeature('cash_register.registers')
  @RequirePermission('cash_register.manage')
  async createRegister(@Request() req, @Body() dto: any) {
    const scope = scopeOf(req);
    if (dto?.branchId && !isBranchAllowed(scope, dto.branchId)) {
      throw new ForbiddenException('مش مسموح لك تضيف كاشير على الفرع ده');
    }
    const branchId = dto?.branchId || resolveBranchForWrite(scope, null, req.user?.branchId);
    const register = await this.service.createRegister(
      req.tenantId,
      { ...dto, branchId: branchId || undefined },
      req.user?.id
    );
    return { success: true, data: register, message: 'تم إضافة الكاشير بنجاح' };
  }

  @Get('shifts/current')
  async currentShift(@Request() req) {
    // لا وردية مفتوحة = حالة طبيعية أول استخدام، مش خطأ
    try {
      const shift = await this.service.getCurrentShift(req.tenantId, req.user.id);
      return { success: true, data: shift };
    } catch {
      return { success: true, data: null };
    }
  }

  @Post('shifts')
  @RequirePermission('cash_register.manage')
  async openShift(
    @Request() req,
    @Body() dto: { cashRegisterId: string; openingBalance: number; notes?: string }
  ) {
    await this.service.assertRegisterAllowed(
      req.tenantId,
      { registerId: dto.cashRegisterId },
      scopeOf(req)
    );
    const shift = await this.service.openShift(
      req.tenantId,
      dto.cashRegisterId,
      dto.openingBalance,
      dto.notes,
      req.user.id
    );
    return { success: true, data: shift, message: 'تم فتح الوردية بنجاح' };
  }

  @Get('shifts/:id/summary')
  async shiftSummary(@Request() req, @Param('id') id: string) {
    await this.service.assertRegisterAllowed(req.tenantId, { shiftId: id }, scopeOf(req));
    return { success: true, data: await this.service.shiftSummary(req.tenantId, id) };
  }

  @Post('shifts/:id/close')
  @RequirePermission('cash_register.manage')
  async closeShift(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: { actualCash: number; actualCard: number; notes?: string }
  ) {
    await this.service.assertRegisterAllowed(req.tenantId, { shiftId: id }, scopeOf(req));
    const shift = await this.service.closeShift(
      req.tenantId,
      id,
      dto.actualCash,
      dto.actualCard,
      dto.notes
    );
    return { success: true, data: shift, message: 'تم إغلاق الوردية بنجاح' };
  }

  @Post('transactions')
  @RequireFeature('cash_register.transactions')
  @RequirePermission('cash_register.manage')
  async addTransaction(
    @Request() req,
    @Body()
    dto: {
      shiftId: string;
      type: 'cash_in' | 'cash_out' | 'expense';
      amount: number;
      description?: string;
    }
  ) {
    await this.service.assertRegisterAllowed(req.tenantId, { shiftId: dto.shiftId }, scopeOf(req));
    const transaction = await this.service.addCashTransaction(
      req.tenantId,
      dto.shiftId,
      dto.type,
      dto.amount,
      dto.description,
      req.user.id
    );
    return { success: true, data: transaction, message: 'تمت العملية بنجاح' };
  }
}

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
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { CreateTransferDto, RejectTransferDto } from './dto/create-transfer.dto';
import { TransfersService } from './transfers.service';
import { actorFromRequest } from '@/modules/audit/audit.service';
import {
  AccessScope,
  assertWarehouseAllowed,
  isWarehouseAllowed,
  scopeOf,
} from '@/common/utils/access-scope';

@ApiTags('inventory-transfers')
@ApiBearerAuth()
@Controller({ path: 'inventory/transfers', version: '1' })
@RequireFeature('inventory', 'inventory.transfers')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  /** التحويل مسموح لو المستخدم له صلاحية على مخزن المصدر أو الوجهة. */
  private async findAllowed(tenantId: string, id: string, scope: AccessScope) {
    const transfer = await this.transfers.findById(tenantId, id);
    if (
      !isWarehouseAllowed(scope, transfer.sourceWarehouseId) &&
      !isWarehouseAllowed(scope, transfer.destinationWarehouseId)
    ) {
      throw new ForbiddenException('مش مسموح لك تتعامل مع التحويل ده');
    }
    return transfer;
  }

  @Get()
  async list(@Request() req, @Query('status') status?: string) {
    return {
      success: true,
      data: await this.transfers.list(req.tenantId, status, scopeOf(req).warehouseIds),
    };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.findAllowed(req.tenantId, id, scopeOf(req)) };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateTransferDto) {
    const scope = scopeOf(req);
    // المصدر والوجهة لازم يكونوا من المخازن المسموحة للمستخدم.
    assertWarehouseAllowed(scope, dto.sourceWarehouseId);
    if (!isWarehouseAllowed(scope, dto.destinationWarehouseId)) {
      throw new ForbiddenException('مش مسموح لك تحوّل للمخزن ده');
    }
    const transfer = await this.transfers.create(
      req.tenantId,
      req.user.id,
      dto,
      actorFromRequest(req)
    );
    return {
      success: true,
      data: transfer,
      message: 'تم إنشاء طلب التحويل وحجز الكمية بانتظار الموافقة',
    };
  }

  @Post(':id/approve')
  async approve(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.findAllowed(req.tenantId, id, scopeOf(req));
    const transfer = await this.transfers.approve(
      req.tenantId,
      id,
      req.user.id,
      actorFromRequest(req)
    );
    return { success: true, data: transfer, message: 'تم اعتماد التحويل وتحديث أرصدة المخزون' };
  }

  @Post(':id/reject')
  async reject(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTransferDto
  ) {
    await this.findAllowed(req.tenantId, id, scopeOf(req));
    const transfer = await this.transfers.reject(
      req.tenantId,
      id,
      req.user.id,
      dto.reason,
      actorFromRequest(req)
    );
    return { success: true, data: transfer, message: 'تم رفض الطلب وتحرير الكمية المحجوزة' };
  }
}

import {
  Body,
  Controller,
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

@ApiTags('inventory-transfers')
@ApiBearerAuth()
@Controller({ path: 'inventory/transfers', version: '1' })
@RequireFeature('inventory')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  async list(@Request() req, @Query('status') status?: string) {
    return { success: true, data: await this.transfers.list(req.tenantId, status) };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.transfers.findById(req.tenantId, id) };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateTransferDto) {
    const transfer = await this.transfers.create(req.tenantId, req.user.id, dto);
    return {
      success: true,
      data: transfer,
      message: 'تم إنشاء طلب التحويل وحجز الكمية بانتظار الموافقة',
    };
  }

  @Post(':id/approve')
  async approve(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    const transfer = await this.transfers.approve(req.tenantId, id, req.user.id);
    return { success: true, data: transfer, message: 'تم اعتماد التحويل وتحديث أرصدة المخزون' };
  }

  @Post(':id/reject')
  async reject(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTransferDto
  ) {
    const transfer = await this.transfers.reject(req.tenantId, id, req.user.id, dto.reason);
    return { success: true, data: transfer, message: 'تم رفض الطلب وتحرير الكمية المحجوزة' };
  }
}

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
import { CreateMaintenanceInvoiceDto } from './dto/create-maintenance-invoice.dto';
import { MaintenanceService } from './maintenance.service';

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller({ path: 'maintenance', version: '1' })
@RequireFeature('maintenance_management')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

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
    return {
      success: true,
      data: await this.maintenance.list(req.tenantId, {
        startDate,
        endDate,
        branchIds: selectedBranches,
      }),
    };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.maintenance.findById(req.tenantId, id) };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateMaintenanceInvoiceDto) {
    const invoice = await this.maintenance.create(
      req.tenantId,
      req.user.id,
      req.user.branchId,
      dto
    );
    return { success: true, data: invoice, message: 'تم حفظ فاتورة الصيانة بنجاح' };
  }
}

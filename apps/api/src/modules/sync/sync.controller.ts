import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller({ path: 'sync', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('sales')
  async syncSales(@Request() req, @Body() dto: { deviceId: string; operations: any[] }) {
    const result = await this.syncService.syncSales(
      req.tenantId,
      dto.deviceId,
      req.user.id,
      dto.operations
    );
    return { success: true, data: result };
  }

  @Get('status')
  async status(@Request() req, @Query('deviceId') deviceId: string) {
    const data = await this.syncService.getStatus(req.tenantId, deviceId);
    return { success: true, data };
  }
}

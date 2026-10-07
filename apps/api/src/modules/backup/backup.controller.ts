import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { BackupService } from './backup.service';

@ApiTags('backup')
@ApiBearerAuth()
@RequirePermission('backup.export')
@Controller({ path: 'backup', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('export')
  @ApiOperation({ summary: 'تصدير نسخة احتياطية JSON كاملة لبيانات المستأجر الحالي' })
  async export(@Request() req) {
    const data = await this.backupService.exportTenantData(req.tenantId);
    return { success: true, data };
  }
}

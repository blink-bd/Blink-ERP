import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { BranchDto, UpdateBranchDto } from './dto/location.dto';
import { isBranchAllowed, scopeOf } from '@/common/utils/access-scope';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@ApiBearerAuth()
@RequirePermission('branches.view')
@RequireFeature('branches')
@Controller({ path: 'branches', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  async findAll(@Request() req) {
    // المستخدم المقيد بيشوف الفروع المسموح له بيها بس.
    const scope = scopeOf(req);
    const branches = await this.branchesService.findAll(req.tenantId);
    return { success: true, data: branches.filter((b: any) => isBranchAllowed(scope, b.id)) };
  }

  @Post()
  @RequirePermission('branches.manage')
  async create(@Request() req, @Body() dto: BranchDto) {
    if (!scopeOf(req).accessAll) {
      throw new ForbiddenException('إضافة فروع متاحة بس للمستخدمين اللي ليهم صلاحية على كل الفروع');
    }
    const branch = await this.branchesService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: branch, message: 'تم إضافة الفرع بنجاح' };
  }

  @Put(':id')
  @RequirePermission('branches.manage')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto
  ) {
    if (!isBranchAllowed(scopeOf(req), id)) {
      throw new ForbiddenException('مش مسموح لك تعدّل الفرع ده');
    }
    const branch = await this.branchesService.update(req.tenantId, id, dto, req.user?.id);
    return { success: true, data: branch, message: 'تم تحديث الفرع بنجاح' };
  }
}

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
  Query,
} from '@nestjs/common';
import { BranchDto, UpdateBranchDto } from './dto/location.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@ApiBearerAuth()
@RequirePermission('branches.view')
@Controller({ path: 'branches', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  async findAll(@Request() req) {
    return { success: true, data: await this.branchesService.findAll(req.tenantId) };
  }

  @Post()
  @RequirePermission('branches.manage')
  async create(@Request() req, @Body() dto: BranchDto) {
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
    const branch = await this.branchesService.update(req.tenantId, id, dto, req.user?.id);
    return { success: true, data: branch, message: 'تم تحديث الفرع بنجاح' };
  }
}

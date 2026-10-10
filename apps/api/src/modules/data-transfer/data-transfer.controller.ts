import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { NoApiKey } from '@/common/decorators/no-api-key.decorator';
import { DataTransferService, getEntityDef } from './data-transfer.service';
import { DATA_ENTITIES } from './data-transfer.definitions';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

@ApiTags('data-transfer')
@ApiBearerAuth()
@NoApiKey()
@Controller({ path: 'data', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionGuard)
export class DataTransferController {
  constructor(private readonly service: DataTransferService) {}

  @Get('entities')
  @RequirePermission('data.import', 'data.export')
  entities() {
    return {
      success: true,
      data: Object.values(DATA_ENTITIES).map((d) => ({
        entity: d.entity,
        labelAr: d.labelAr,
        matchBy: d.matchBy,
        columns: d.columns.map((c) => ({
          key: c.key,
          label: c.label,
          required: !!c.required,
          exportOnly: !!c.exportOnly,
          createOnly: !!c.createOnly,
        })),
      })),
    };
  }

  @Get('template/:entity')
  @RequirePermission('data.import')
  async template(@Request() req, @Param('entity') entity: string, @Res() res: Response) {
    const def = getEntityDef(entity);
    const csv = await this.service.template(req.user, def);
    this.sendCsv(res, `${def.entity}-template.csv`, csv);
  }

  @Get('export/:entity')
  @RequirePermission('data.export')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async export(@Request() req, @Param('entity') entity: string, @Res() res: Response) {
    const def = getEntityDef(entity);
    const { csv } = await this.service.export(req.user, def, req);
    const date = new Date().toISOString().slice(0, 10);
    this.sendCsv(res, `${def.entity}-${date}.csv`, csv);
  }

  @Post('import/:entity')
  @RequirePermission('data.import')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.csv$/i.test(file.originalname) || /csv|text\/plain|excel/.test(file.mimetype);
        cb(
          ok
            ? null
            : new BadRequestException('الملف لازم يكون CSV (احفظه من Excel بصيغة CSV UTF-8)'),
          ok
        );
      },
    })
  )
  async import(
    @Request() req,
    @Param('entity') entity: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
    @Query('dryRun') dryRun?: string
  ) {
    const def = getEntityDef(entity);
    if (!file?.buffer?.length) throw new BadRequestException('ارفع ملف CSV');
    const text = file.buffer.toString('utf8');
    if (text.includes('\u0000')) throw new BadRequestException('الملف مش CSV نصي (ممكن يكون xlsx)');
    const isDryRun = dryRun !== 'false' && dryRun !== '0';
    const data = await this.service.import(req.user, def, text, isDryRun, req);
    return { success: true, data };
  }

  private sendCsv(res: Response, filename: string, csv: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }
}

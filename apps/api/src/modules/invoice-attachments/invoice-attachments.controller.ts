import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { InvoiceAttachmentsService } from './invoice-attachments.service';
import { UploadedEvidenceFile } from './uploaded-evidence-file';

@ApiTags('invoice-attachments')
@ApiBearerAuth()
@Controller({ path: 'invoice-attachments', version: '1' })
@RequireFeature('invoice_attachments')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class InvoiceAttachmentsController {
  constructor(private readonly attachments: InvoiceAttachmentsService) {}

  @Post('invoices/:entityType/:invoiceId')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowed.includes(file.mimetype)) {
          callback(new BadRequestException('الملفات المسموحة: JPG وPNG وWebP وPDF'), false);
          return;
        }
        callback(null, true);
      },
    })
  )
  async upload(
    @Request() req,
    @Param('entityType') entityType: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @UploadedFile() file?: UploadedEvidenceFile
  ) {
    return {
      success: true,
      data: await this.attachments.upload(req.tenantId, req.user.id, entityType, invoiceId, file),
    };
  }

  @Get('invoices/:entityType/:invoiceId')
  async list(
    @Request() req,
    @Param('entityType') entityType: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string
  ) {
    return {
      success: true,
      data: await this.attachments.list(req.tenantId, entityType, invoiceId),
    };
  }

  @Get('files/:attachmentId/content')
  async content(
    @Request() req,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() response: Response
  ) {
    const file = await this.attachments.getContent(req.tenantId, attachmentId);
    const fallbackName = file.originalName.replace(/["\\\r\n]/g, '_').replace(/[^\x20-\x7e]/g, '_');
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.content.length);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(file.content);
  }

  @Delete('files/:attachmentId')
  async remove(@Request() req, @Param('attachmentId', ParseUUIDPipe) attachmentId: string) {
    return { success: true, data: await this.attachments.remove(req.tenantId, attachmentId) };
  }
}

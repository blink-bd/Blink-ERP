import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { InvoiceAttachment } from './invoice-attachment.entity';
import { UploadedEvidenceFile } from './uploaded-evidence-file';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_INVOICE = 10;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

@Injectable()
export class InvoiceAttachmentsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(tenantId: string, entityType: string, entityId: string) {
    const type = this.normalizeType(entityType);
    await this.ensureInvoiceExists(tenantId, type, entityId);
    const attachments = await this.dataSource
      .getRepository(InvoiceAttachment)
      .createQueryBuilder('attachment')
      .select([
        'attachment.id',
        'attachment.entityType',
        'attachment.entityId',
        'attachment.originalName',
        'attachment.mimeType',
        'attachment.sizeBytes',
        'attachment.createdAt',
      ])
      .where('attachment.tenantId = :tenantId', { tenantId })
      .andWhere('attachment.entityType = :type', { type })
      .andWhere('attachment.entityId = :entityId', { entityId })
      .orderBy('attachment.createdAt', 'DESC')
      .getMany();
    return attachments.map((item) => ({ ...item, sizeBytes: Number(item.sizeBytes) }));
  }

  async upload(
    tenantId: string,
    userId: string,
    entityType: string,
    entityId: string,
    file?: UploadedEvidenceFile
  ) {
    const type = this.normalizeType(entityType);
    if (!file?.buffer?.length) throw new BadRequestException('اختر ملفاً لإرفاقه');
    if (file.size > MAX_FILE_BYTES)
      throw new BadRequestException('الحد الأقصى لحجم الملف 5 ميجابايت');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('الملفات المسموحة: JPG وPNG وWebP وPDF');
    }
    const detectedMime = this.detectMime(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype) {
      throw new BadRequestException('محتوى الملف لا يطابق نوعه المعلن');
    }

    const id = randomUUID();
    const originalName = this.sanitizeFilename(file.originalname);
    const table = type === 'sale' ? 'sales' : 'purchases';
    await this.dataSource.transaction(async (manager) => {
      const [invoice] = await manager.query(
        `SELECT id, branch_id AS "branchId" FROM ${table}
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [entityId, tenantId]
      );
      if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
      const [{ count }] = await manager.query(
        `SELECT COUNT(*)::int AS count FROM invoice_attachments
         WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3`,
        [tenantId, type, entityId]
      );
      if (Number(count) >= MAX_ATTACHMENTS_PER_INVOICE) {
        throw new BadRequestException(
          `الحد الأقصى ${MAX_ATTACHMENTS_PER_INVOICE} مرفقات لكل فاتورة`
        );
      }
      await manager.query(
        `INSERT INTO invoice_attachments
           (id, tenant_id, branch_id, entity_type, entity_id, object_key, storage_provider,
            original_name, mime_type, size_bytes, created_by, content)
         VALUES ($1, $2, $3, $4, $5, $1, 'database', $6, $7, $8, $9, $10)`,
        [
          id,
          tenantId,
          invoice.branchId || null,
          type,
          entityId,
          originalName,
          detectedMime,
          file.size,
          userId,
          file.buffer,
        ]
      );
    });
    return {
      id,
      entityType: type,
      entityId,
      originalName,
      mimeType: detectedMime,
      sizeBytes: file.size,
      createdAt: new Date(),
    };
  }

  async getContent(tenantId: string, attachmentId: string) {
    const [row] = await this.dataSource.query(
      `SELECT id, original_name AS "originalName", mime_type AS "mimeType", size_bytes AS "sizeBytes", content
       FROM invoice_attachments WHERE tenant_id = $1 AND id = $2`,
      [tenantId, attachmentId]
    );
    if (!row) throw new NotFoundException('المرفق غير موجود');
    return {
      ...row,
      content: Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content),
    };
  }

  async remove(tenantId: string, attachmentId: string) {
    const result = await this.dataSource.query(
      'DELETE FROM invoice_attachments WHERE tenant_id = $1 AND id = $2 RETURNING id',
      [tenantId, attachmentId]
    );
    if (result.length === 0) throw new NotFoundException('المرفق غير موجود');
    return { deleted: true };
  }

  private async ensureInvoiceExists(tenantId: string, type: 'sale' | 'purchase', entityId: string) {
    const table = type === 'sale' ? 'sales' : 'purchases';
    const [invoice] = await this.dataSource.query(
      `SELECT id, branch_id AS "branchId" FROM ${table}
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [entityId, tenantId]
    );
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    return invoice as { id: string; branchId?: string };
  }

  private normalizeType(value: string): 'sale' | 'purchase' {
    if (value === 'sales' || value === 'sale') return 'sale';
    if (value === 'purchases' || value === 'purchase') return 'purchase';
    throw new BadRequestException('نوع الفاتورة غير صالح');
  }

  private sanitizeFilename(filename: string) {
    const leaf = filename.replace(/\\/g, '/').split('/').pop() || 'attachment';
    const safe = leaf
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 250);
    return safe || 'attachment';
  }

  private detectMime(buffer: Buffer): string | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
    return null;
  }
}

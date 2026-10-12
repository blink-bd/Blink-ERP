import { Module } from '@nestjs/common';
import { InvoiceAttachmentsController } from './invoice-attachments.controller';
import { InvoiceAttachmentsService } from './invoice-attachments.service';

@Module({
  controllers: [InvoiceAttachmentsController],
  providers: [InvoiceAttachmentsService],
})
export class InvoiceAttachmentsModule {}

import { Module } from '@nestjs/common';
import { FeaturesModule } from '@/modules/features/features.module';
import { InvoiceAttachmentsController } from './invoice-attachments.controller';
import { InvoiceAttachmentsService } from './invoice-attachments.service';

@Module({
  imports: [FeaturesModule],
  controllers: [InvoiceAttachmentsController],
  providers: [InvoiceAttachmentsService],
})
export class InvoiceAttachmentsModule {}

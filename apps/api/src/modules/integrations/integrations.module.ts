import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { BackupAlertsController } from './backup-alerts.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([WebhookEndpoint, WebhookDelivery])],
  controllers: [WebhooksController, BackupAlertsController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class IntegrationsModule {}

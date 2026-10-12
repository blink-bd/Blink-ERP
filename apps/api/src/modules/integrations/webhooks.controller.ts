import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller({ path: 'webhooks', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  async list(@Request() req) {
    return { success: true, data: await this.webhooks.list(req.tenantId) };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateWebhookDto) {
    const endpoint = await this.webhooks.create(req.tenantId, req.user.id, dto);
    return {
      success: true,
      data: endpoint,
      message: 'تم إنشاء Webhook. احفظ المفتاح الآن؛ لن يظهر مرة أخرى.',
    };
  }

  @Post(':id/test')
  async test(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.webhooks.test(req.tenantId, id) };
  }

  @Post(':id/rotate-secret')
  async rotateSecret(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.webhooks.rotateSecret(req.tenantId, id),
      message: 'تم تدوير المفتاح. احفظ المفتاح الجديد الآن.',
    };
  }

  @Get(':id/deliveries')
  async deliveries(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.webhooks.listDeliveries(req.tenantId, id) };
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    await this.webhooks.remove(req.tenantId, id);
    return { success: true, message: 'تم حذف Webhook' };
  }
}

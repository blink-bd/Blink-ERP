import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { Repository, IsNull } from 'typeorm';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WEBHOOK_EVENTS, WebhookEventName } from './webhook-events';

interface Target {
  url: URL;
  addresses: LookupAddress[];
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookEndpoint) private readonly endpoints: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery) private readonly deliveries: Repository<WebhookDelivery>,
    private readonly config: ConfigService
  ) {}

  async list(tenantId: string) {
    const endpoints = await this.endpoints.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return endpoints.map((endpoint) => this.publicEndpoint(endpoint));
  }

  async create(tenantId: string, userId: string, input: { url: string; events: string[] }) {
    const target = await this.validateTarget(input.url);
    const secret = randomBytes(32).toString('base64url');
    const endpoint = await this.endpoints.save(
      this.endpoints.create({
        tenantId,
        url: target.url.toString(),
        secretCiphertext: this.encryptSecret(secret),
        events: [...new Set(input.events)],
        isActive: true,
        createdBy: userId,
      })
    );

    // المفتاح يعاد مرة واحدة فقط ولا يتم تخزينه أو عرضه بنص صريح بعد ذلك.
    return { ...this.publicEndpoint(endpoint), signingSecret: secret };
  }

  async rotateSecret(tenantId: string, id: string) {
    const endpoint = await this.findEndpoint(tenantId, id);
    const secret = randomBytes(32).toString('base64url');
    endpoint.secretCiphertext = this.encryptSecret(secret);
    await this.endpoints.save(endpoint);
    return { ...this.publicEndpoint(endpoint), signingSecret: secret };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const endpoint = await this.findEndpoint(tenantId, id);
    await this.endpoints.softRemove(endpoint);
  }

  async listDeliveries(tenantId: string, endpointId: string) {
    await this.findEndpoint(tenantId, endpointId);
    return this.deliveries.find({
      where: { tenantId, endpointId, deletedAt: IsNull() },
      order: { attemptedAt: 'DESC' },
      take: 50,
    });
  }

  async test(tenantId: string, endpointId: string) {
    const endpoint = await this.findEndpoint(tenantId, endpointId);
    const delivery = await this.deliver(endpoint, 'webhook.test', {
      message: 'اختبار اتصال من Blink ERP',
      timestamp: new Date().toISOString(),
    });
    return { endpoint: this.publicEndpoint(endpoint), delivery };
  }

  /**
   * Emits a signed event to active tenant endpoints. Delivery failures are logged
   * but never roll back the ERP transaction that produced the event.
   */
  async emit(
    tenantId: string,
    event: WebhookEventName,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!WEBHOOK_EVENTS.includes(event)) return;
    try {
      const endpoints = await this.endpoints.find({
        where: { tenantId, isActive: true, deletedAt: IsNull() },
      });
      const subscribers = endpoints.filter((endpoint) => endpoint.events.includes(event));
      await Promise.all(subscribers.map((endpoint) => this.deliver(endpoint, event, data)));
    } catch (error) {
      this.logger.warn(`Webhook event ${event} could not be dispatched: ${this.safeError(error)}`);
    }
  }

  private async findEndpoint(tenantId: string, id: string): Promise<WebhookEndpoint> {
    const endpoint = await this.endpoints.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!endpoint) throw new NotFoundException('رابط الـ Webhook غير موجود');
    return endpoint;
  }

  private publicEndpoint(endpoint: WebhookEndpoint) {
    return {
      id: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
      isActive: endpoint.isActive,
      createdAt: endpoint.createdAt,
    };
  }

  private encryptionKey(): Buffer {
    const configured = this.config.get<string>('WEBHOOK_ENCRYPTION_KEY');
    if (!configured || configured.length < 32) {
      throw new ServiceUnavailableException(
        'WEBHOOK_ENCRYPTION_KEY يجب ضبطه (32 حرفاً على الأقل) قبل إنشاء Webhook'
      );
    }
    return createHash('sha256').update(configured).digest();
  }

  private encryptSecret(secret: string): string {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  private decryptSecret(encrypted: string): string {
    const [ivValue, tagValue, ciphertextValue] = encrypted.split('.');
    if (!ivValue || !tagValue || !ciphertextValue)
      throw new Error('Invalid encrypted webhook secret');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private async validateTarget(rawUrl: string): Promise<Target> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('رابط Webhook غير صالح');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      throw new BadRequestException('يجب أن يستخدم Webhook رابط HTTPS عام على المنفذ 443');
    }
    if (url.hash) throw new BadRequestException('لا يُسمح بوجود جزء (#) في رابط Webhook');

    const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new BadRequestException('لا يمكن توصيل Webhook إلى عنوان محلي أو داخلي');
    }

    let addresses: LookupAddress[];
    const literalFamily = isIP(hostname);
    try {
      addresses = literalFamily
        ? [{ address: hostname, family: literalFamily }]
        : await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException('تعذر التحقق من عنوان Webhook؛ تحقق من اسم النطاق');
    }
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address))) {
      throw new BadRequestException('يجب أن يشير Webhook إلى عنوان IP عام');
    }

    return { url, addresses };
  }

  private isPrivateAddress(address: string): boolean {
    if (isIP(address) === 4) {
      const octets = address.split('.').map(Number);
      const [a, b] = octets;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
      );
    }

    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (isIP(mapped) === 4) return this.isPrivateAddress(mapped);
      return true;
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    );
  }

  private async deliver(
    endpoint: WebhookEndpoint,
    event: WebhookEventName,
    data: Record<string, unknown>
  ) {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const body = JSON.stringify({
      id: eventId,
      type: event,
      occurredAt,
      tenantId: endpoint.tenantId,
      data,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', this.decryptSecret(endpoint.secretCiphertext))
      .update(`${timestamp}.${body}`)
      .digest('hex');
    const attemptedAt = new Date();

    let httpStatus: number | undefined;
    let responseBody = '';
    let errorMessage: string | undefined;
    try {
      const target = await this.validateTarget(endpoint.url);
      const response = await this.postPinned(target, body, {
        'Content-Type': 'application/json',
        'User-Agent': 'Blink-ERP-Webhooks/1.0',
        'X-Blink-Event': event,
        'X-Blink-Event-Id': eventId,
        'X-Blink-Timestamp': timestamp,
        'X-Blink-Signature': `sha256=${signature}`,
      });
      httpStatus = response.status;
      responseBody = response.body.slice(0, 1000);
      if (response.status < 200 || response.status >= 300) {
        errorMessage = `Receiver responded with HTTP ${response.status}`;
      }
    } catch (error) {
      errorMessage = this.safeError(error);
    }

    const succeeded = httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300;
    const record = await this.deliveries.save(
      this.deliveries.create({
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        eventId,
        eventType: event,
        status: succeeded ? 'succeeded' : 'failed',
        httpStatus,
        responseBody: responseBody || undefined,
        errorMessage,
        attemptedAt,
        deliveredAt: succeeded ? new Date() : undefined,
      })
    );
    return record;
  }

  private postPinned(
    target: Target,
    body: string,
    headers: Record<string, string>
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const address = target.addresses[0];
      const req = httpsRequest(
        target.url,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
          timeout: 8000,
          servername: target.url.hostname,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size <= 4096) chunks.push(chunk);
          });
          res.on('end', () => {
            resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') });
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('Webhook request timeout')));
      req.on('error', reject);
      req.end(body);
    });
  }

  private safeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes('timeout')) return 'timeout';
      return error.name;
    }
    return 'unknown error';
  }
}

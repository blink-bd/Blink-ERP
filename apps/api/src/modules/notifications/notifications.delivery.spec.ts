import { createServer, Server, Socket } from 'node:net';
import { NotificationsService } from './notifications.service';

/**
 * اختبار مسار الإرسال الحقيقي بدون مزود خارجي:
 * - البريد عبر خادم SMTP محلي يستقبل الرسالة فعلياً (EHLO/AUTH/MAIL/RCPT/DATA).
 * - WhatsApp عبر اعتراض fetch والتحقق من عنوان Graph API والحمولة والرسالة العربية.
 */
describe('NotificationsService delivery paths', () => {
  const buildConfig = (values: Record<string, string | undefined>) => ({
    get: jest.fn((key: string) => values[key]),
  });

  describe('email (SMTP)', () => {
    let server: Server;
    let port: number;
    let received: string[] = [];

    beforeAll(async () => {
      server = createServer((socket: Socket) => {
        socket.write('220 local.test ESMTP\r\n');
        let inData = false;
        let buffer = '';
        socket.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          let index = buffer.indexOf('\r\n');
          while (index !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            if (inData) {
              if (line === '.') {
                inData = false;
                received.push('DATA-END');
                socket.write('250 2.0.0 queued\r\n');
              } else {
                received.push(line);
              }
            } else if (/^EHLO|^HELO/i.test(line)) {
              socket.write('250-local.test\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
            } else if (/^AUTH/i.test(line)) {
              socket.write('235 2.7.0 authenticated\r\n');
            } else if (/^MAIL FROM/i.test(line)) {
              received.push(line);
              socket.write('250 2.1.0 ok\r\n');
            } else if (/^RCPT TO/i.test(line)) {
              received.push(line);
              socket.write('250 2.1.5 ok\r\n');
            } else if (/^DATA/i.test(line)) {
              inData = true;
              socket.write('354 go ahead\r\n');
            } else if (/^QUIT/i.test(line)) {
              socket.write('221 bye\r\n');
              socket.end();
            } else {
              socket.write('250 ok\r\n');
            }
            index = buffer.indexOf('\r\n');
          }
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      port = (server.address() as any).port;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('sends the Arabic operational alert to the configured recipients', async () => {
      received = [];
      const service = new NotificationsService(
        buildConfig({
          MAIL_HOST: '127.0.0.1',
          MAIL_PORT: String(port),
          MAIL_SECURE: 'false',
          MAIL_USER: 'blinkbusinessdevelopment@gmail.com',
          MAIL_PASSWORD: 'app-password-placeholder',
          MAIL_FROM: 'blinkbusinessdevelopment@gmail.com',
          NOTIFICATION_EMAIL_TO: 'blinkbusinessdevelopment@gmail.com',
        }) as any
      );

      const result = await service.sendOperationalAlert({
        event: 'backup.completed',
        title: 'اكتمل النسخ الاحتياطي',
        details: { الحالة: 'نجاح', الملف: 'backups/e2e.dump' },
      });

      expect(result.email).toBe('sent');
      expect(result.whatsapp).toBe('skipped'); // WhatsApp غير مضبوط في هذا الاختبار

      const transcript = received.join('\n');
      expect(transcript).toContain('blinkbusinessdevelopment@gmail.com');
      expect(transcript).toContain('Subject:');
      expect(transcript).toContain('Content-Type: text/plain; charset=utf-8');

      // رسالة SMTP مُرمّزة base64 UTF-8: نفكّ الترميز ونتحقق من المحتوى العربي الفعلي.
      const decoded = received
        .filter((line) => /^[A-Za-z0-9+/=]{20,}$/.test(line))
        .map((line) => Buffer.from(line, 'base64').toString('utf8'))
        .join('\n');
      expect(decoded).toContain('Blink ERP');
      expect(decoded).toContain('اكتمل النسخ الاحتياطي');
      expect(decoded).toContain('backups/e2e.dump');
      expect(decoded).toContain('الحالة: نجاح');
    });

    it('reports the channel as failed without throwing when SMTP is unreachable', async () => {
      const service = new NotificationsService(
        buildConfig({
          MAIL_HOST: '127.0.0.1',
          MAIL_PORT: '1',
          MAIL_SECURE: 'false',
          MAIL_USER: 'blinkbusinessdevelopment@gmail.com',
          MAIL_PASSWORD: 'wrong',
          NOTIFICATION_EMAIL_TO: 'blinkbusinessdevelopment@gmail.com',
        }) as any
      );
      const result = await service.sendOperationalAlert({
        event: 'sale.created',
        title: 'بيع جديد',
        details: { الإجمالي: 100 },
      });
      expect(result.email).toBe('failed');
    }, 30000);
  });

  describe('whatsapp (Meta Cloud API payload)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('posts an Arabic text message to the configured recipient', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      global.fetch = jest.fn(async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wa-1' }] }) } as any;
      }) as any;

      const service = new NotificationsService(
        buildConfig({
          WHATSAPP_API_VERSION: 'v26.0',
          WHATSAPP_PHONE_NUMBER_ID: '1234567890',
          WHATSAPP_ACCESS_TOKEN: 'token-placeholder',
          WHATSAPP_TO: '+201024898091',
        }) as any
      );

      const result = await service.sendOperationalAlert({
        event: 'balance.customer_overdue',
        title: 'تذكير بمديونية العميل أحمد',
        details: { الرصيد_المستحق: 1500, عدد_الأيام: 30 },
      });

      expect(result.whatsapp).toBe('sent');
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://graph.facebook.com/v26.0/1234567890/messages');
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer token-placeholder');
      const payload = JSON.parse(String(calls[0].init.body));
      expect(payload.messaging_product).toBe('whatsapp');
      expect(payload.to).toBe('201024898091');
      expect(payload.type).toBe('text');
      expect(payload.text.body).toContain('تذكير بمديونية العميل أحمد');
      expect(payload.text.body).toContain('الرصيد_المستحق: 1500');
    });

    it('uses the approved template when WHATSAPP_TEMPLATE_NAME is configured', async () => {
      const calls: any[] = [];
      global.fetch = jest.fn(async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return { ok: true, status: 200 } as any;
      }) as any;

      const service = new NotificationsService(
        buildConfig({
          WHATSAPP_API_VERSION: 'v26.0',
          WHATSAPP_PHONE_NUMBER_ID: '1234567890',
          WHATSAPP_ACCESS_TOKEN: 'token-placeholder',
          WHATSAPP_TO: '+201024898091',
          WHATSAPP_TEMPLATE_NAME: 'blink_erp_alert',
          WHATSAPP_TEMPLATE_LANGUAGE: 'ar',
        }) as any
      );

      const status = service.getStatus();
      expect(status.whatsapp.mode).toBe('template');
      expect(status.whatsapp.recipient).toBe('+201024898091');

      await service.sendOperationalAlert({
        event: 'supplier.payables_limit_exceeded',
        title: 'تجاوز حد مستحقات الموردين',
        details: { إجمالي_المستحق: 900 },
      });

      const payload = JSON.parse(String(calls[0].init.body));
      expect(payload.type).toBe('template');
      expect(payload.template.name).toBe('blink_erp_alert');
      expect(payload.template.language.code).toBe('ar');
      expect(payload.template.components[0].parameters[0].text).toContain('تجاوز حد مستحقات');
    });

    it('marks the channel as failed when the provider rejects the request', async () => {
      global.fetch = jest.fn(async () => ({ ok: false, status: 401 })) as any;
      const service = new NotificationsService(
        buildConfig({
          WHATSAPP_PHONE_NUMBER_ID: '1234567890',
          WHATSAPP_ACCESS_TOKEN: 'bad-token',
          WHATSAPP_TO: '+201024898091',
        }) as any
      );
      const result = await service.sendOperationalAlert({
        event: 'sale.created',
        title: 'بيع جديد',
        details: {},
      });
      expect(result.whatsapp).toBe('failed');
    });
  });

  describe('channel status', () => {
    it('defaults to the requested recipients when nothing is configured', () => {
      const service = new NotificationsService(buildConfig({}) as any);
      expect(service.getStatus()).toEqual({
        email: { configured: false, recipient: 'blinkbusinessdevelopment@gmail.com' },
        whatsapp: { configured: false, recipient: '+201024898091', mode: 'text' },
      });
    });
  });
});

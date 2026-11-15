// كل التواريخ بتتخزن UTC، وتوقيت كل تاجر (tenants.timezone) بيتطبق وقت الحساب/العرض.
process.env.TZ = 'UTC';

import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { join, sep } from 'node:path';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { validateSecurityEnv } from './common/security/env.validation';
import { maintenancePageHtml } from './maintenance-page';

/**
 * تقديم واجهة الويب (apps/web/dist) من نفس خدمة الـ API.
 *
 * الفايدة: رابط واحد للسيستم كله (الواجهة + الـ API)، فمفيش CORS ولا
 * Cookies طرف ثالث، ومفيش اعتماد على نشر منفصل ممكن يتوقف أو يتمسح.
 * بيتفعّل تلقائياً لو مجلد public موجود، وبيتقفل بـ SERVE_WEB=false.
 */
function serveWebApp(app: NestExpressApplication): string | null {
  if (process.env.SERVE_WEB === 'false') return null;

  const webDist = process.env.WEB_DIST_PATH || join(__dirname, '..', 'public');
  const indexPath = join(webDist, 'index.html');
  if (!existsSync(indexPath)) return null;

  app.useStaticAssets(webDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (filePath.includes(`${sep}assets${sep}`)) {
        // ملفات Vite أسماؤها فيها hash، فتخزينها سنة كاملة آمن.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  const http = app.getHttpAdapter().getInstance();
  // أي مسار مش تحت /api بيرجع index.html عشان React Router يشتغل (SPA fallback)
  http.get(/^\/(?!api\/).*/, (_req: unknown, res: { sendFile: (p: string) => void }) =>
    res.sendFile(indexPath)
  );

  return webDist;
}

/**
 * الخدمة لازم تفضل ماسكة المنفذ من أول ثانية، حتى لو قاعدة البيانات لسه
 * مش متاحة. غير كده المنصة بتشوف إن النشر فاشل (أو بتعيد تشغيل في حلقة)
 * والمستخدم بيشوف صفحة فاضية بدل سبب واضح.
 *
 * السيرفر المبدئي بيرد على فحوص الصحة وبصفحة صيانة، وأول ما قاعدة البيانات
 * ترجع بنستبدل معالج الطلبات بتطبيق Nest بدون إعادة تشغيل العملية.
 */
function startPlaceholderServer(port: number): {
  server: Server;
  attach: (handler: express.Express) => void;
} {
  const placeholder = express();
  placeholder.disable('x-powered-by');

  placeholder.get('/api/v1/health/live', (_req, res) => {
    res.json({
      success: true,
      data: { status: 'alive', database: 'connecting', timestamp: new Date().toISOString() },
    });
  });
  placeholder.get('/api/v1/health', (_req, res) => {
    res.status(503).json({
      success: false,
      data: { status: 'unavailable', database: 'unavailable', timestamp: new Date().toISOString() },
    });
  });
  placeholder.use((_req, res) => {
    res.status(503).type('html').send(maintenancePageHtml());
  });

  const server = placeholder.listen(port, '0.0.0.0', () => {
    console.log(`⏳ الخدمة متاحة على المنفذ ${port} — بانتظار قاعدة البيانات`);
  });

  const attach = (handler: express.Express) => {
    server.removeAllListeners('request');
    server.on('request', handler as unknown as (req: unknown, res: unknown) => void);
  };

  return { server, attach };
}

async function bootstrap() {
  validateSecurityEnv();

  const port = Number(process.env.PORT || 3000);
  const retryDelayMs = Math.max(5000, Number(process.env.BOOT_RETRY_DELAY_MS) || 15000);

  let placeholderAttached = true;
  const { server, attach } = startPlaceholderServer(port);
  let attempting = false;

  const connect = async (attempt: number): Promise<void> => {
    if (attempting) return;
    attempting = true;
    try {
      const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: true,
        logger: ['log', 'error', 'warn'],
        // بدون كده Nest بينهي العملية (process.exit) لو فشل الاتصال بقاعدة
        // البيانات، وده بيمنع إعادة المحاولة والتعافي التلقائي.
        abortOnError: false,
      });

      const configService = app.get(ConfigService);
      configureApp(app, configService);

      const webDist = serveWebApp(app);

      // app.init() بيفتح الاتصال بقاعدة البيانات من غير ما يحجز منفذ جديد
      await app.init();

      if (placeholderAttached) {
        attach(app.getHttpAdapter().getInstance());
        placeholderAttached = false;
      } else {
        await app.listen(port, '0.0.0.0');
      }
      app.enableShutdownHooks();

      console.log(`🚀 Application is running on port ${port}`);
      if (webDist) console.log(`🖥️  Web app served from ${webDist}`);
      if (configService.get('NODE_ENV') !== 'production') {
        console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `⏳ محاولة ${attempt}: قاعدة البيانات غير متاحة (${message.slice(0, 200)}) — ` +
          `هعيد المحاولة بعد ${Math.round(retryDelayMs / 1000)} ثانية`
      );
      setTimeout(() => void connect(attempt + 1), retryDelayMs);
    } finally {
      attempting = false;
    }
  };

  await connect(1);

  // حماية من إغلاق العملية لو السيرفر نفسه وقع لأي سبب
  server.on('error', (error) => {
    console.error('❌ خطأ في السيرفر:', error);
  });
}

bootstrap();

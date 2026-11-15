// كل التواريخ بتتخزن UTC، وتوقيت كل تاجر (tenants.timezone) بيتطبق وقت الحساب/العرض.
process.env.TZ = 'UTC';

import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { validateSecurityEnv } from './common/security/env.validation';

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

async function bootstrap() {
  validateSecurityEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  configureApp(app, configService);

  const webDist = serveWebApp(app);

  const port = Number(configService.get('PORT') || 3000);
  await app.listen(port, '0.0.0.0');
  app.enableShutdownHooks();
  console.log(`🚀 Application is running on port ${port}`);
  if (webDist) console.log(`🖥️  Web app served from ${webDist}`);
  if (configService.get('NODE_ENV') !== 'production') {
    console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  }
}

bootstrap();

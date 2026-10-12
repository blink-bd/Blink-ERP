import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { parseAllowedOrigins } from './common/security/env.validation';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';

/**
 * تهيئة تطبيق Nest بنفس الإعدادات في التشغيل الحقيقي وفي اختبارات التكامل،
 * حتى لا يختلف سلوك الـ Cookies وCSRF وCORS بين البيئتين.
 */
export function configureApp(app: INestApplication, configService: ConfigService): void {
  const express = app.getHttpAdapter().getInstance();
  const configuredHops = Number(configService.get('TRUST_PROXY_HOPS') ?? 1);
  express.set(
    'trust proxy',
    Number.isInteger(configuredHops) && configuredHops >= 0 ? configuredHops : 1
  );
  express.disable('x-powered-by');

  // Cookies must be parsed before the CSRF middleware and cookie-based auth guards.
  app.use(cookieParser());
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    })
  );
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(compression());

  const isProduction = configService.get('NODE_ENV') === 'production';
  const origins = [
    ...parseAllowedOrigins(configService.get<string>('FRONTEND_URL')),
    ...parseAllowedOrigins(configService.get<string>('CORS_ORIGINS')),
  ];
  if (!isProduction) {
    origins.push('http://localhost:5173', 'tauri://localhost', 'http://tauri.localhost');
  }
  const allowedOrigins = new Set(origins);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
      // Server-to-server calls have no Origin; browser origins must be explicitly allowed.
      if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ''))) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Backup-Alert-Token',
      'X-API-Key',
      'X-Reminder-Job-Token',
    ],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });

  // Mutating browser requests must send the double-submit CSRF token.
  const csrfMiddleware = new CsrfMiddleware();
  app.use((req: any, res: any, next: any) => csrfMiddleware.use(req, res, next));

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('ERP/POS API')
      .setDescription('Multi-Tenant ERP/POS System API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'مفتاح API للتكاملات (blk_live_...)',
        },
        'api-key'
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('tenants', 'Tenant management')
      .addTag('users', 'User management')
      .addTag('products', 'Product catalog')
      .addTag('sales', 'Sales management and returns')
      .addTag('inventory', 'Inventory management and approved transfers')
      .addTag('customers', 'Customer management')
      .addTag('suppliers', 'Supplier management')
      .addTag('reports', 'Reports and branch analytics')
      .addTag('webhooks', 'Signed outbound webhooks')
      .addTag('electronic-receipts', 'Public receipt verification')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // خلف Render/Cloudflare: استخدم قيمة Render الموثوقة لعنوان العميل وحدود الطلبات.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(cookieParser());
  app.use(helmet());
  app.use(compression());

  const isProduction = configService.get('NODE_ENV') === 'production';
  const configuredOrigins = [
    configService.get<string>('FRONTEND_URL'),
    ...(configService.get<string>('CORS_ORIGINS') || '').split(','),
  ]
    .map((origin) => origin?.trim().replace(/\/$/, ''))
    .filter((origin): origin is string => Boolean(origin));
  if (!isProduction) {
    configuredOrigins.push('http://localhost:5173', 'tauri://localhost', 'http://tauri.localhost');
  }
  const allowedOrigins = new Set(configuredOrigins);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
        callback(new Error('Origin is not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Backup-Alert-Token'],
    maxAge: 600,
  });

  // كل طلب يغيّر البيانات يحتاج رمز CSRF مطابقاً للكوكي والـ header.
  const csrfMiddleware = new CsrfMiddleware();
  app.use((req, res, next) => csrfMiddleware.use(req, res, next));

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

  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ERP/POS API')
      .setDescription('Multi-Tenant ERP/POS System API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('tenants', 'Tenant management')
      .addTag('products', 'Product catalog')
      .addTag('sales', 'Sales management')
      .addTag('inventory', 'Inventory management and approved transfers')
      .addTag('webhooks', 'Signed outbound webhooks')
      .addTag('electronic-receipts', 'Public receipt verification')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(configService.get('PORT') || 3000);
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on port ${port}`);
}

bootstrap();

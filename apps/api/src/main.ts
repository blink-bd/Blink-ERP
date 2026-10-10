import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { parseAllowedOrigins, validateSecurityEnv } from './common/security/env.validation';

async function bootstrap() {
  validateSecurityEnv();

  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // خلف Render/Cloudflare: اعتبر أول Proxy موثوق (عشان الـ IP الحقيقي وحدود الطلبات)
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', Number(configService.get('TRUST_PROXY_HOPS') ?? 1));
  express.disable('x-powered-by');

  // Security headers (API فقط — مفيش HTML بيتقدم من هنا)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    })
  );

  // منع تخزين ردود الـ API (بيانات مالية/شخصية) في أي كاش وسيط أو في المتصفح
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Compression
  app.use(compression());

  // CORS
  const allowedOrigins = parseAllowedOrigins(
    configService.get('FRONTEND_URL') || 'http://localhost:5173'
  );
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
      // طلبات بدون Origin (curl / تكاملات API من سيرفر لسيرفر) مسموحة — الحماية بالتوكن/المفتاح
      if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, '')))
        return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Swagger documentation
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ERP/POS API')
      .setDescription('Multi-Tenant ERP/POS System API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('tenants', 'Tenant management')
      .addTag('users', 'User management')
      .addTag('products', 'Product catalog')
      .addTag('sales', 'Sales management')
      .addTag('inventory', 'Inventory management')
      .addTag('customers', 'Customer management')
      .addTag('suppliers', 'Supplier management')
      .addTag('reports', 'Reports and analytics')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get('PORT') || 3000;
  await app.listen(port);

  app.enableShutdownHooks();
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  if (configService.get('NODE_ENV') !== 'production') {
    console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  }
}

bootstrap();

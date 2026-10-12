import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { validateSecurityEnv } from './common/security/env.validation';

async function bootstrap() {
  validateSecurityEnv();

  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  configureApp(app, configService);

  const port = Number(configService.get('PORT') || 3000);
  await app.listen(port, '0.0.0.0');
  app.enableShutdownHooks();
  console.log(`🚀 Application is running on port ${port}`);
  if (configService.get('NODE_ENV') !== 'production') {
    console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  }
}

bootstrap();

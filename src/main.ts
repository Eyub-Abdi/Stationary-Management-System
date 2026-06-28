import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { initErrorReporter } from './common/observability/error-reporter';
import { UPLOAD_ROOT } from './modules/uploads/upload.config';

async function bootstrap() {
  // Wire optional external error tracking before anything can throw.
  initErrorReporter();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api';
  const apiVersion = config.get<string>('app.apiVersion') ?? 'v1';
  const port = config.get<number>('app.port') ?? 3000;

  // Security headers. Allow cross-origin embedding of uploaded images so a
  // separate frontend origin can render product photos via <img src>.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Serve uploaded files read-only at /uploads/...
  app.useStaticAssets(join(UPLOAD_ROOT), { prefix: '/uploads/' });

  // CORS — restricted to configured origins in production.
  const origins = config.get<string[]>('app.corsOrigins') ?? ['*'];
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
  });

  // Global route prefix + URI versioning: /api/v1/...
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion.replace(/^v/, ''),
    prefix: 'v',
  });

  // Serve the built frontend (single-process production mode). No-op in dev,
  // where the SPA is served by Vite and `frontend/dist` does not exist. With a
  // build present, the whole app runs from this one process at the API port.
  const frontendDist = join(process.cwd(), 'frontend', 'dist');
  const indexHtml = join(frontendDist, 'index.html');
  if (existsSync(indexHtml)) {
    app.useStaticAssets(frontendDist);
    // SPA fallback: any non-API, non-uploads GET returns index.html so client
    // routes (e.g. /pos, /settings) work on refresh/deep-link.
    app.getHttpAdapter().getInstance().get(/^\/(?!api|uploads).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
    logger.log(`Serving frontend from ${frontendDist}`);
  }

  // Graceful shutdown (drains connections, runs onModuleDestroy hooks).
  app.enableShutdownHooks();

  // OpenAPI / Swagger.
  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.get<string>('app.appName') ?? 'Stationery Management System')
    .setDescription('Production API for stationery & printing business operations.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/${apiPrefix}/${apiVersion}`);
  logger.log(`Swagger docs at http://localhost:${port}/${apiPrefix}/docs`);
}

void bootstrap();

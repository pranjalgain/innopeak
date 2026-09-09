import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { copyStaticAssets } from '@common/helpers/copy-static-assets';
import { RouteNames } from '@common/route-names';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import type { EnvConfig } from '@config/env.config';
import { TraceIdInterceptor } from '@interceptors/trace-id.interceptor';
import { TracingInterceptor } from '@interceptors/tracing.interceptor';
import { LoggerService } from '@logger/logger.service';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import helmet from 'helmet';

import * as path from 'path';

import { AuthModule } from './api/auth/auth.module';
import { ConnectionsModule } from './api/connections/connections.module';
import { DashboardModule } from './api/dashboard/dashboard.module';
import { PromptsModule } from './api/prompts/prompts.module';
import { ReviewsModule } from './api/reviews/reviews.module';
import { SettingsModule } from './api/settings/settings.module';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    snapshot: false, // true - Enable Debugging
    bufferLogs: false, // true - Enable Debugging
    rawBody: false, // true - Enable raw body, Required for payment webhooks
  });

  const configService = app.get(ConfigService<EnvConfig>);
  const environment = configService.get<string>('NODE_ENV') ?? 'development';
  const isProd = environment === 'production';

  const logger = await app.resolve(LoggerService);
  app.useLogger(logger);

  // Apply Helmet Middleware for setting security-related HTTP headers
  app.use(helmet());

  // Apply response compression
  app.use(compression());

  // Parses the refresh_token cookie into req.cookies for POST /v1/auth/refresh and logout —
  // see AuthController.
  app.use(cookieParser());

  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') ?? [];

  // Enable CORS with specific settings
  app.enableCors({
    origin: corsOrigins,
    credentials: true, // Include credentials in CORS requests
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Accept, Authorization, x-forwarded-for, x-client-ip, x-real-ip, referer, user-agent, x-forwarded-host, x-forwarded-user-agent, referrer, x-forwarded-referer, x-forwarded-origin, origin, host',
  });

  // Limit Request Size to 1MB
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ─── Swagger: Per-Version API Docs ────────────────────────────────────────
  // Each API version gets its own Swagger UI at /api/v{n}.
  // Infrastructure endpoints (health, metrics, tracing, dev-tools) are excluded
  // since they use VERSION_NEUTRAL and are not part of the versioned API contract.
  //
  // To add a new version:
  //   1. Create v{n} controllers (e.g., UsersV2Controller with version: '2')
  //   2. Add a new Swagger document block below with the relevant modules
  //   3. The new docs will be available at /api/v{n}
  // ─────────────────────────────────────────────────────────────────────────────

  // Every business module registered in AppModule belongs here — `include` is an allowlist, so a
  // module missing from it serves its routes normally but is invisible in /api/v1. Nothing fails
  // loudly when one is forgotten; the endpoints simply do not appear.
  const V1_MODULES = [
    AuthModule,
    ConnectionsModule,
    DashboardModule,
    PromptsModule,
    ReviewsModule,
    SettingsModule,
  ];

  if (!isProd) {
    // V1 API docs at /api/v1
    const v1Config = new DocumentBuilder()
      .setTitle('InnoPeak APIs — v1')
      .setDescription('API v1 documentation for the InnoPeak backend services')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const v1Document = SwaggerModule.createDocument(app, v1Config, {
      include: V1_MODULES,
    });
    SwaggerModule.setup(`${RouteNames.API_DOCS}/v1`, app, v1Document);

    // V2 API docs (add versioned modules here once a v2 endpoint actually exists)

    // Default /api redirects to latest stable version
    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.get(`/${RouteNames.API_DOCS}`, (_req: Request, res: Response) => {
      res.redirect(`/${RouteNames.API_DOCS}/v1`);
    });
  }

  // Use global filters and pipes
  const errorHandler = app.get(ErrorHandlerService);
  app.useGlobalFilters(new HttpExceptionFilter(errorHandler));
  app.useGlobalInterceptors(new TraceIdInterceptor(), new TracingInterceptor(configService));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically remove non-whitelisted properties
      forbidNonWhitelisted: true, // Return an error for non-whitelisted properties
      transform: true, // Transform plain input objects to class instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Serve static assets
  app.useStaticAssets(path.join(__dirname, '..', 'assets'), {
    prefix: '/assets/',
  });
  app.setBaseViewsDir(path.join(__dirname, '..', 'views'));
  app.setViewEngine('pug');

  // Default Route - Show Friendly Info Page
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get(
    ['/', '/v1', `/${RouteNames.DEV_TOOLS}`, `/${RouteNames.QUEUES_UI}`],
    (_req: Request, res: Response) => {
      res.status(200).render('default', {
        app: 'Project/App Name',
        environment,
        isProd,
        message: isProd
          ? 'You are hitting a wrong URL. Please check the official API documentation.'
          : 'Welcome to the backend service. Use the options below to explore further.',
      });
    }
  );
  if (!isProd) {
    expressApp.get('/robots.txt', (_req: Request, res: Response) =>
      res.type('text/plain').send('User-agent: *\nDisallow: /')
    );
  }

  // Enable graceful shutdown hooks (SIGTERM/SIGINT trigger onModuleDestroy)
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port, '0.0.0.0');
  const appUrl = await app.getUrl();
  Logger.log(`App is running on ${appUrl}`, 'Project/App Name');
  await copyStaticAssets();
}

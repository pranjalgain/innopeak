import { SessionRevocationService } from '@auth/services/session-revocation.service';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { copyStaticAssets } from '@common/helpers/copy-static-assets';
import { RouteNames } from '@common/route-names';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import { isLocalDevelopment } from '@config/deployment-target.util';
import type { EnvConfig } from '@config/env.config';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { LoggerService } from '@logger/logger.service';
import { createOpsToolsGuard } from '@middlewares/dev-tool.middleware';
import { createMetricsGuard } from '@middlewares/metrics-guard.middleware';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import * as path from 'path';

import { AdminModule } from './api/admin/admin.module';
import { AiModule } from './api/ai/ai.module';
import { AuthModule } from './api/auth/auth.module';
import { BillingModule } from './api/billing/billing.module';
import { ConnectionsModule } from './api/connections/connections.module';
import { DashboardModule } from './api/dashboard/dashboard.module';
import { MediaModule } from './api/media/media.module';
import { NotificationsModule } from './api/notifications/notifications.module';
import { PromptsModule } from './api/prompts/prompts.module';
import { ReviewsModule } from './api/reviews/reviews.module';
import { SettingsModule } from './api/settings/settings.module';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    snapshot: false, // true - Enable Debugging
    bufferLogs: false, // true - Enable Debugging
    rawBody: true, // Required for payment webhooks
  });

  const configService = app.get(ConfigService<EnvConfig>);
  const environment = configService.get<string>('NODE_ENV') ?? 'development';
  const isProd = environment === 'production';

  const logger = await app.resolve(LoggerService);
  app.useLogger(logger);

  app.use(helmet());

  // Number of reverse proxies in front of the app, so `req.ip` (the throttler's key) is the real
  // client. Unset behind a load balancer, all callers share one rate-limit bucket. A count, not
  // `true`: trusting the whole X-Forwarded-For chain lets a client spoof a rotating address.
  // Must match the real topology; 0 (trust nothing) is right when directly exposed.
  const trustProxyHops = configService.get<number>('TRUST_PROXY_HOPS') ?? 0;
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  // Compression buffers a response until it has a chunk to compress, which would hold back every event of a server-sent-events stream.
  app.use(
    compression({
      filter: (req, res) => {
        // By what the response is, not only what the client asked for: curl, fetch and health probes send `Accept: */*`.
        const contentType = res.getHeader('Content-Type');
        if (
          (typeof contentType === 'string' && contentType.includes('text/event-stream')) ||
          req.headers.accept?.includes('text/event-stream') === true
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  // Populates req.cookies (refresh_token for refresh/logout).
  app.use(cookieParser());

  // Platform-admin gate for ops surfaces outside the Nest route layer (Bull Board is an Express
  // sub-app the global guards never reach). Must follow cookieParser and precede routing; without
  // it Bull Board's email-OTP job payloads are world-readable (account takeover).
  const opsToolsGuard = createOpsToolsGuard(
    app.get(JwtService),
    configService,
    app.get(PlatformAdminDbService, { strict: false }),
    app.get(SessionRevocationService, { strict: false })
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    opsToolsGuard(req, res, next).catch(next);
  });
  app.use(createMetricsGuard(configService));

  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') ?? [];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Accept, Authorization, x-forwarded-for, x-client-ip, x-real-ip, referer, user-agent, x-forwarded-host, x-forwarded-user-agent, referrer, x-forwarded-referer, x-forwarded-origin, origin, host',
  });

  // Stripe signature verification needs the exact raw bytes Stripe signed. This route-scoped raw
  // parser must precede the global bodyParser.json() below. `rawBody: true` above only covers
  // Nest's own parsers, so `verify` populates req.rawBody here. `/v1` is hardcoded because this
  // runs before app.enableVersioning().
  app.use(
    `/v1/${RouteNames.BILLING}/${RouteNames.BILLING_WEBHOOKS_STRIPE}`,
    bodyParser.raw({
      type: 'application/json',
      // Stated, not left to body-parser's 100 kb default: a handled event (checkout, subscription, invoice) is a few kilobytes, so this is
      // a bound on what an unauthenticated caller can make this route buffer before the signature is checked.
      limit: '256kb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // JSON only, deliberately: no inbound route takes a form body. A `urlencoded` parser would let any other site auto-submit a
  // `<form method="post">` to a public route such as `/v1/auth/login` (no preflight, no Origin check) and have the response's
  // Set-Cookie replace the victim's session. JSON needs a CORS preflight, which a foreign origin fails.
  app.use(bodyParser.json({ limit: '1mb' }));

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Every business module registered in AppModule belongs here: `include` is an allowlist, so a
  // forgotten module serves its routes but is silently missing from /api/v1. Infrastructure
  // (VERSION_NEUTRAL) modules are excluded on purpose.
  const V1_MODULES = [
    AdminModule,
    AiModule,
    AuthModule,
    BillingModule,
    ConnectionsModule,
    DashboardModule,
    MediaModule,
    NotificationsModule,
    PromptsModule,
    ReviewsModule,
    SettingsModule,
  ];

  // Not `!isProd`: a staging box also runs as `development`, and the API docs and raw DB errors belong on a developer's machine only.
  if (isLocalDevelopment()) {
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

    // /api redirects to the latest version
    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.get(`/${RouteNames.API_DOCS}`, (_req: Request, res: Response) => {
      res.redirect(`/${RouteNames.API_DOCS}/v1`);
    });
  }

  const errorHandler = app.get(ErrorHandlerService);
  app.useGlobalFilters(new HttpExceptionFilter(errorHandler));
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

  app.useStaticAssets(path.join(__dirname, '..', 'assets'), {
    prefix: '/assets/',
  });
  app.setBaseViewsDir(path.join(__dirname, '..', 'views'));
  app.setViewEngine('pug');

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get(['/', '/v1', `/${RouteNames.QUEUES_UI}`], (_req: Request, res: Response) => {
    res.status(200).render('default', {
      app: 'InnoPeak',
      environment,
      isProd,
      message: isProd
        ? 'You are hitting a wrong URL. Please check the official API documentation.'
        : 'Welcome to the backend service. Use the options below to explore further.',
    });
  });
  if (!isProd) {
    expressApp.get('/robots.txt', (_req: Request, res: Response) =>
      res.type('text/plain').send('User-agent: *\nDisallow: /')
    );
  }

  // SIGTERM/SIGINT trigger onModuleDestroy
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port, '0.0.0.0');
  const appUrl = await app.getUrl();
  Logger.log(`App is running on ${appUrl}`, 'InnoPeak');
  await copyStaticAssets();
}

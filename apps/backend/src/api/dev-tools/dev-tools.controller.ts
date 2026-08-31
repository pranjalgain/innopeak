import { Public } from '@auth/decorators/public.decorator';
import { RouteNames } from '@common/route-names';
import { EnvConfig } from '@config/env.config';
import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { SqsQueueStatusService } from './services/sqs-queue-status.service';

interface DevTool {
  name: string;
  url: string;
  icon: string;
}

@Controller({ path: RouteNames.DEV_TOOLS, version: VERSION_NEUTRAL })
@ApiTags('Dev Tools')
@ApiExcludeController()
@Public()
export class DevToolsController {
  private readonly jaegerUrl: string;
  private readonly grafanaUrl: string;
  private readonly appLogsUrl: string;
  private readonly apiDocsUrl: string;
  private readonly devDocsUrl: string;
  private readonly bullBoardUrl: string;
  private readonly systemHealthUrl: string;
  private readonly isAws: boolean;

  constructor(
    private readonly configService: ConfigService<EnvConfig>,
    private readonly sqsQueueStatusService: SqsQueueStatusService
  ) {
    this.grafanaUrl = this.configService.get<string>('GRAFANA_URL') ?? 'http://localhost:3001';
    this.appLogsUrl = this.configService.get<string>('APP_LOGS_URL') ?? 'https://localhost:3000';
    this.devDocsUrl = this.configService.get<string>('DEV_DOCS_URL') ?? 'https://localhost:3100';
    this.systemHealthUrl =
      this.configService.get<string>('SERVICES_HEALTH_URL') ??
      `/${RouteNames.HEALTH}/${RouteNames.HEALTH_UI}`;
    this.jaegerUrl = this.configService.get<string>('JAGER_URL') ?? 'http://localhost:16686';
    this.apiDocsUrl = `/${RouteNames.API_DOCS}`;
    this.bullBoardUrl = `/${RouteNames.QUEUES_UI}`;
    this.isAws = this.configService.get<string>('DEPLOYMENT_TARGET' as keyof EnvConfig) === 'aws';
  }

  @Get()
  showTools(@Res() res: Response): void {
    const tools: DevTool[] = [
      { name: 'Grafana', url: this.grafanaUrl, icon: 'grafana.png' },
      { name: 'Jaeger', url: this.jaegerUrl, icon: 'jaeger.png' },
      {
        name: 'Application Logs',
        url: this.appLogsUrl,
        icon: 'logs.png',
      },
      { name: 'System Health', url: this.systemHealthUrl, icon: 'health.png' },
      { name: 'Dev Docs', url: this.devDocsUrl, icon: 'docs.png' },
      { name: 'API Docs', url: this.apiDocsUrl, icon: 'swagger.png' },
    ];

    // Bull Board only exists in 'local' mode (BullMQ); in 'aws' mode, queue visibility comes from
    // the SQS Queues panel below instead — see QueueTransportModule/docker-compose.floci.yml.
    if (this.isAws) {
      tools.push({
        name: 'SQS Queues',
        url: `/${RouteNames.DEV_TOOLS}/${RouteNames.DEV_TOOLS_QUEUES}`,
        icon: 'bull.png',
      });
    } else {
      tools.push({ name: 'Bull Board', url: this.bullBoardUrl, icon: 'bull.png' });
    }

    res.render('dev-tools', {
      title: 'Dev Tools',
      tools,
      user: 'Developer',
    });
  }

  // Uses @Res() + manual res.render() rather than @Render(), like showTools() above — the
  // globally-registered TransformInterceptor (see app.module.ts) wraps every other handler's
  // return value in an ApiResponse envelope, which would bury `isAws`/`queues` one level deeper
  // than the pug template's top-level locals expect.
  @Get(RouteNames.DEV_TOOLS_QUEUES)
  @ApiExcludeEndpoint()
  async showQueues(@Res() res: Response): Promise<void> {
    const queues = this.isAws ? await this.sqsQueueStatusService.getQueueDepths() : [];

    res.render('dev-tools-queues', {
      title: 'SQS Queues',
      isAws: this.isAws,
      queues,
    });
  }
}

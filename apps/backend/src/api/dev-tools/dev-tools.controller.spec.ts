import type { EnvConfig } from '@config/env.config';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';

import { DevToolsController } from './dev-tools.controller';
import { SqsQueueStatusService } from './services/sqs-queue-status.service';

describe('DevToolsController', () => {
  let sqsQueueStatusService: { getQueueDepths: jest.Mock };

  const buildController = async (
    configValues: Record<string, string>
  ): Promise<DevToolsController> => {
    const configService = { get: jest.fn((key: string) => configValues[key]) };
    sqsQueueStatusService = { getQueueDepths: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevToolsController],
      providers: [
        { provide: ConfigService<EnvConfig>, useValue: configService },
        { provide: SqsQueueStatusService, useValue: sqsQueueStatusService },
      ],
    }).compile();

    return module.get(DevToolsController);
  };

  describe('showTools', () => {
    it('shows a Bull Board tool card in local mode', async () => {
      const controller = await buildController({ DEPLOYMENT_TARGET: 'local' });
      const res = { render: jest.fn() } as unknown as Response;

      controller.showTools(res);

      const { tools } = (res.render as jest.Mock).mock.calls[0][1] as {
        tools: { name: string }[];
      };
      expect(tools.some(t => t.name === 'Bull Board')).toBe(true);
      expect(tools.some(t => t.name === 'SQS Queues')).toBe(false);
    });

    it('shows an SQS Queues tool card in aws mode instead of Bull Board', async () => {
      const controller = await buildController({ DEPLOYMENT_TARGET: 'aws' });
      const res = { render: jest.fn() } as unknown as Response;

      controller.showTools(res);

      const { tools } = (res.render as jest.Mock).mock.calls[0][1] as {
        tools: { name: string }[];
      };
      expect(tools.some(t => t.name === 'SQS Queues')).toBe(true);
      expect(tools.some(t => t.name === 'Bull Board')).toBe(false);
    });
  });

  describe('showQueues', () => {
    it('renders an empty queue list without querying SQS in local mode', async () => {
      const controller = await buildController({ DEPLOYMENT_TARGET: 'local' });
      const res = { render: jest.fn() } as unknown as Response;

      await controller.showQueues(res);

      expect(res.render).toHaveBeenCalledWith('dev-tools-queues', {
        title: 'SQS Queues',
        isAws: false,
        queues: [],
      });
      expect(sqsQueueStatusService.getQueueDepths).not.toHaveBeenCalled();
    });

    it('delegates to SqsQueueStatusService and renders its result in aws mode', async () => {
      const controller = await buildController({ DEPLOYMENT_TARGET: 'aws' });
      const res = { render: jest.fn() } as unknown as Response;
      sqsQueueStatusService.getQueueDepths.mockResolvedValue([
        { queueName: 'email', mainDepth: 2, dlqDepth: 0 },
      ]);

      await controller.showQueues(res);

      expect(res.render).toHaveBeenCalledWith('dev-tools-queues', {
        title: 'SQS Queues',
        isAws: true,
        queues: [{ queueName: 'email', mainDepth: 2, dlqDepth: 0 }],
      });
    });
  });
});

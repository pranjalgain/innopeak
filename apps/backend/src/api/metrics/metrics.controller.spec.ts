import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { register } from 'prom-client';

import { MetricsController } from './metrics.controller';

jest.mock('prom-client', () => ({
  register: {
    metrics: jest.fn(),
  },
}));

describe('MetricsController', () => {
  let target: MetricsController;
  let res: { status: jest.Mock; send: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
    }).compile();

    target = module.get(MetricsController);

    res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
  });

  afterEach(() => jest.clearAllMocks());

  describe('getDefaultMetrics', () => {
    it('responds with 200 and the serialized Prometheus metrics', async () => {
      (register.metrics as jest.Mock).mockResolvedValue('metric_a 1\nmetric_b 2\n');

      await target.getDefaultMetrics(res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('metric_a 1\nmetric_b 2\n');
    });

    it('responds with 500 and logs the error message and stack when fetching metrics fails', async () => {
      const error = new Error('registry exploded');
      (register.metrics as jest.Mock).mockRejectedValue(error);
      const loggerErrorSpy = jest
        .spyOn(
          (target as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
          'error'
        )
        .mockImplementation(() => undefined);

      await target.getDefaultMetrics(res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Failure',
          message: 'Failed to retrieve metrics',
          statusCode: 500,
          data: null,
        })
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('registry exploded'),
        error.stack
      );
    });

    it('logs an undefined stack when a non-Error value is thrown', async () => {
      (register.metrics as jest.Mock).mockRejectedValue('a plain string rejection');
      const loggerErrorSpy = jest
        .spyOn(
          (target as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
          'error'
        )
        .mockImplementation(() => undefined);

      await target.getDefaultMetrics(res as unknown as Response);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('a plain string rejection'),
        undefined
      );
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

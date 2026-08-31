import type { SendEmailOptions } from '@email/interfaces/email.interface';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { createTransport } from 'nodemailer';

import { SmtpEmailProvider } from './smtp.provider';

const mockSendMail = jest.fn();
const mockVerify = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockImplementation(() => ({
    sendMail: mockSendMail,
    verify: mockVerify,
  })),
}));

describe('SmtpEmailProvider', () => {
  let target: SmtpEmailProvider;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, number | string> = {
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: 587,
          SMTP_USER: 'user',
          SMTP_PASSWORD: 'pass',
          EMAIL_FROM: 'noreply@example.com',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SmtpEmailProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(SmtpEmailProvider);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a transporter with the configured SMTP options', () => {
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user', pass: 'pass' },
      })
    );
  });

  describe('send', () => {
    it('sends the mail via the transporter and returns the messageId', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'smtp-message-id' });

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>Hi</p>',
        text: 'Hi',
        replyTo: 'reply@example.com',
      };

      const result = await target.send(options);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
          to: 'user@example.com',
          subject: 'Hi',
          html: '<p>Hi</p>',
          text: 'Hi',
          replyTo: 'reply@example.com',
        })
      );
      expect(result).toEqual({ messageId: 'smtp-message-id' });
    });

    it('joins multiple recipients and maps attachments', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'smtp-message-id-2' });

      await target.send({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Hi',
        attachments: [{ filename: 'file.txt', content: 'data', contentType: 'text/plain' }],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@example.com, b@example.com',
          attachments: [{ filename: 'file.txt', content: 'data', contentType: 'text/plain' }],
        })
      );
    });

    it('propagates errors thrown by the transporter', async () => {
      mockSendMail.mockRejectedValue(new Error('connection refused'));

      await expect(target.send({ to: 'user@example.com', subject: 'Hi' })).rejects.toThrow(
        'connection refused'
      );
    });
  });

  describe('verify', () => {
    it('resolves true when the transporter verifies successfully', async () => {
      mockVerify.mockResolvedValue(true);

      await expect(target.verify()).resolves.toBe(true);
      expect(mockVerify).toHaveBeenCalled();
    });

    it('propagates errors when transporter verification fails', async () => {
      mockVerify.mockRejectedValue(new Error('auth failed'));

      await expect(target.verify()).rejects.toThrow('auth failed');
    });
  });

  describe('onModuleInit', () => {
    it('logs success without throwing when verification succeeds', async () => {
      mockVerify.mockResolvedValue(true);

      await expect(target.onModuleInit()).resolves.toBeUndefined();
    });

    it('swallows verification errors so app bootstrap is not blocked', async () => {
      mockVerify.mockRejectedValue(new Error('SMTP unreachable'));

      await expect(target.onModuleInit()).resolves.toBeUndefined();
    });
  });
});

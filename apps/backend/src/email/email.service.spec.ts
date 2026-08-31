import type { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';
import { EmailProvider } from '@email/providers/email.provider';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { readFile } from 'fs/promises';

import { EmailService } from './email.service';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('EmailService', () => {
  let target: EmailService;
  let emailProvider: { send: jest.Mock };

  beforeEach(async () => {
    emailProvider = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService, { provide: EmailProvider, useValue: emailProvider }],
    }).compile();

    target = module.get(EmailService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendEmail', () => {
    it('delegates to the configured email provider and returns its result', async () => {
      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>Hi</p>',
      };
      const expected: EmailSendResult = { messageId: 'msg-1' };
      emailProvider.send.mockResolvedValue(expected);

      const result = await target.sendEmail(options);

      expect(emailProvider.send).toHaveBeenCalledWith(options);
      expect(result).toEqual(expected);
    });

    it('propagates errors thrown by the provider', async () => {
      const options: SendEmailOptions = { to: 'user@example.com', subject: 'Hi' };
      emailProvider.send.mockRejectedValue(new Error('provider down'));

      await expect(target.sendEmail(options)).rejects.toThrow('provider down');
    });
  });

  describe('sendTemplateEmail', () => {
    it('compiles the template, derives subject/data and sends via the provider', async () => {
      mockedReadFile.mockResolvedValue('<h1>Hello {{name}}</h1>');
      emailProvider.send.mockResolvedValue({ messageId: 'msg-2' });

      const result = await target.sendTemplateEmail('welcome', 'welcome', { name: 'Ada' });

      expect(mockedReadFile).toHaveBeenCalledWith(expect.stringContaining('welcome.hbs'), 'utf-8');
      expect(emailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'welcome',
          subject: 'Welcome',
          html: '<h1>Hello Ada</h1>',
        })
      );
      expect(result).toEqual({ messageId: 'msg-2' });
    });

    it('caches compiled templates so the file is only read once', async () => {
      mockedReadFile.mockResolvedValue('<p>{{title}}</p>');
      emailProvider.send.mockResolvedValue({ messageId: 'msg-3' });

      await target.sendTemplateEmail('to@example.com', 'notification', { title: 'First' });
      await target.sendTemplateEmail('to@example.com', 'notification', { title: 'Second' });

      expect(mockedReadFile).toHaveBeenCalledTimes(1);
      expect(emailProvider.send).toHaveBeenLastCalledWith(
        expect.objectContaining({ html: '<p>Second</p>' })
      );
    });

    it('uses provided overrides for subject/from/replyTo/attachments instead of derived values', async () => {
      mockedReadFile.mockResolvedValue('<p>Body</p>');
      emailProvider.send.mockResolvedValue({ messageId: 'msg-4' });

      await target.sendTemplateEmail(
        ['a@example.com'],
        'reset-password',
        {},
        {
          subject: 'Custom Subject',
          from: 'custom@example.com',
          replyTo: 'reply@example.com',
        }
      );

      expect(emailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Custom Subject',
          from: 'custom@example.com',
          replyTo: 'reply@example.com',
        })
      );
    });

    it('propagates errors when the template file cannot be read', async () => {
      mockedReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(
        target.sendTemplateEmail('to@example.com', 'missing-template', {})
      ).rejects.toThrow('ENOENT: no such file');
      expect(emailProvider.send).not.toHaveBeenCalled();
    });
  });
});

import type {
  IErasureNoticeEmailJob,
  IErasurePurgeAlertEmailJob,
  ILocationsPausedEmailJob,
  IOtpEmailJob,
} from '@bg/interfaces/job.interface';
import { EmailService } from '@email/email.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { EmailQueueService } from './email-queue.service';

describe('EmailQueueService', () => {
  let target: EmailQueueService;
  let emailService: { sendTemplateEmail: jest.Mock };

  const data: IOtpEmailJob = {
    email: 'user@example.com',
    otp: '123456',
    customerName: 'Jane Doe',
  };

  beforeEach(async () => {
    emailService = { sendTemplateEmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailQueueService, { provide: EmailService, useValue: emailService }],
    }).compile();

    target = module.get(EmailQueueService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('erasure emails', () => {
    const notice: IErasureNoticeEmailJob = {
      kind: 'scheduled',
      email: 'owner@example.com',
      customerName: 'Jane',
      businessName: 'Acme <Dental>',
      locale: 'de',
      requestedBy: 'owner',
      restore: 'you',
      loginUrl: 'https://app.test/login',
      scheduledFor: '2026-10-27T09:00:00.000Z',
    };

    it('renders an erasure notice through the shared template, in the recipient’s language', async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });

      await target.sendErasureNoticeEmail(notice);

      const [to, template, context, overrides] = emailService.sendTemplateEmail.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
        { subject: string },
      ];
      expect(to).toBe('owner@example.com');
      expect(template).toBe('erasure-notice');
      expect(context).toMatchObject({ lang: 'de', actionUrl: 'https://app.test/login' });
      expect(String(context['body'])).toContain('Acme &lt;Dental&gt;');
      expect(overrides.subject).toBe('Acme <Dental> ist zur Löschung vorgemerkt');
    });

    it('sends the platform-admin purge alert through the same template', async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });
      const alert: IErasurePurgeAlertEmailJob = {
        email: 'root@innopeak.test',
        locale: 'en',
        skipped: [{ name: 'Acme', daysOverdue: 2, reason: 'stripe unreachable' }],
      };

      await target.sendErasurePurgeAlertEmail(alert);

      const [to, template, context, overrides] = emailService.sendTemplateEmail.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
        { subject: string },
      ];
      expect(to).toBe('root@innopeak.test');
      expect(template).toBe('erasure-notice');
      expect(String(context['body'])).toContain('stripe unreachable');
      expect(overrides.subject).toContain('1 erasure could not be completed');
    });

    it('propagates a send failure so the queue can retry it', async () => {
      emailService.sendTemplateEmail.mockRejectedValue(new Error('smtp down'));

      await expect(target.sendErasureNoticeEmail(notice)).rejects.toThrow('smtp down');
    });
  });

  describe('sendLocationsPausedEmail', () => {
    const job: ILocationsPausedEmailJob = {
      email: 'owner@example.com',
      customerName: 'Jane',
      locale: 'de',
      businessName: 'Coastal Table',
      maxLocations: 1,
      keptLocationNames: ['Harbor St'],
      pausedLocationNames: ['Old Town'],
      settingsUrl: 'https://app.test/settings?tab=billing',
    };

    it("renders the notification template in the owner's language, with the billing link", async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });

      await target.sendLocationsPausedEmail(job);

      const [to, template, context, overrides] = emailService.sendTemplateEmail.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
        { subject: string },
      ];
      expect(to).toBe('owner@example.com');
      expect(template).toBe('notification');
      expect(context).toMatchObject({
        lang: 'de',
        actionUrl: 'https://app.test/settings?tab=billing',
        actionText: 'Abrechnungseinstellungen öffnen',
      });
      expect(String(context['body'])).toContain('<li>Old Town</li>');
      expect(overrides.subject).toBe('Einige Standorte von Coastal Table wurden pausiert');
    });

    it('propagates a send failure so the queue can retry it', async () => {
      emailService.sendTemplateEmail.mockRejectedValue(new Error('smtp down'));

      await expect(target.sendLocationsPausedEmail(job)).rejects.toThrow('smtp down');
    });
  });

  describe('sendOtpEmail', () => {
    it('sends the mfa-code template with the correct data and an OTP-free subject', async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });

      await target.sendOtpEmail(data);

      expect(emailService.sendTemplateEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
        data.email,
        'mfa-code',
        {
          name: 'Jane Doe',
          code: '123456',
          expiresIn: '10 minutes',
          appName: 'InnoPeak',
          year: new Date().getFullYear(),
        },
        {
          subject: 'Your InnoPeak verification code',
        }
      );
    });

    it('falls back to "User" when customerName is not provided', async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });
      const dataWithoutName: IOtpEmailJob = { email: 'anon@example.com', otp: '654321' };

      await target.sendOtpEmail(dataWithoutName);

      expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
        dataWithoutName.email,
        'mfa-code',
        expect.objectContaining({ name: 'User', code: '654321' }),
        { subject: 'Your InnoPeak verification code' }
      );
    });

    it('never puts the OTP in the subject line', async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });

      await target.sendOtpEmail(data);

      const options = emailService.sendTemplateEmail.mock.calls[0]?.[3] as { subject: string };
      expect(options.subject).not.toContain(data.otp);
    });

    it('preserves a leading zero in the code', async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });
      const dataWithLeadingZero: IOtpEmailJob = { email: 'anon@example.com', otp: '042913' };

      await target.sendOtpEmail(dataWithLeadingZero);

      expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
        dataWithLeadingZero.email,
        'mfa-code',
        expect.objectContaining({ code: '042913' }),
        { subject: 'Your InnoPeak verification code' }
      );
    });

    it('uses the given expiresIn instead of the default when provided', async () => {
      emailService.sendTemplateEmail.mockResolvedValue({ success: true });

      await target.sendOtpEmail({ ...data, expiresIn: '5 minutes' });

      expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
        data.email,
        'mfa-code',
        expect.objectContaining({ expiresIn: '5 minutes' }),
        expect.anything()
      );
    });

    it('propagates the error when sending the template email rejects', async () => {
      const error = new Error('SMTP provider unavailable');
      emailService.sendTemplateEmail.mockRejectedValue(error);

      await expect(target.sendOtpEmail(data)).rejects.toThrow(error);
    });
  });
});

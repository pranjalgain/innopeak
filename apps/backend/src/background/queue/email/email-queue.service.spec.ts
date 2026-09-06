import type { IOtpEmailJob } from '@bg/interfaces/job.interface';
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

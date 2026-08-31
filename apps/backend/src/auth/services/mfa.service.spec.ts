import { HashingService } from '@common/hashing/hashing.service';
import { MfaRepository } from '@db/repositories/auth/mfa.repository';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';

import { MfaService } from './mfa.service';

jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));

describe('MfaService', () => {
  let target: MfaService;
  let mfaRepository: {
    findUserById: jest.Mock;
    upsertMfaSetting: jest.Mock;
    findMfaSetting: jest.Mock;
    markMfaVerified: jest.Mock;
    enableMfaOnUser: jest.Mock;
    updateBackupCodes: jest.Mock;
  };
  let hashingService: { hash: jest.Mock; compare: jest.Mock };

  beforeEach(async () => {
    mfaRepository = {
      findUserById: jest.fn(),
      upsertMfaSetting: jest.fn(),
      findMfaSetting: jest.fn(),
      markMfaVerified: jest.fn(),
      enableMfaOnUser: jest.fn(),
      updateBackupCodes: jest.fn(),
    };
    hashingService = {
      hash: jest.fn(),
      compare: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: MfaRepository, useValue: mfaRepository },
        { provide: HashingService, useValue: hashingService },
      ],
    }).compile();

    target = module.get(MfaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('setupTotp', () => {
    it('generates a secret, otpauth URL, and QR code, then stores the secret', async () => {
      mfaRepository.findUserById.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
      (generateSecret as jest.Mock).mockReturnValue('SECRET123');
      (generateURI as jest.Mock).mockReturnValue('otpauth://totp/NestJS%20App:user@example.com');
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,abc');

      const result = await target.setupTotp('user-1');

      expect(result).toEqual({
        secret: 'SECRET123',
        otpauthUrl: 'otpauth://totp/NestJS%20App:user@example.com',
        qrCode: 'data:image/png;base64,abc',
      });
      expect(generateURI).toHaveBeenCalledWith({
        issuer: 'NestJS App',
        label: 'user@example.com',
        secret: 'SECRET123',
      });
      expect(mfaRepository.upsertMfaSetting).toHaveBeenCalledWith('user-1', 'totp', 'SECRET123');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      mfaRepository.findUserById.mockResolvedValue(null);

      await expect(target.setupTotp('missing-user')).rejects.toThrow(NotFoundException);
      expect(mfaRepository.upsertMfaSetting).not.toHaveBeenCalled();
    });
  });

  describe('verifyTotp', () => {
    it('returns true and marks the setting verified on first successful verification', async () => {
      mfaRepository.findMfaSetting.mockResolvedValue({
        id: 'setting-1',
        secretEncrypted: 'SECRET123',
        isVerified: false,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });

      const result = await target.verifyTotp('user-1', '123456');

      expect(result).toBe(true);
      expect(otpVerify).toHaveBeenCalledWith({ token: '123456', secret: 'SECRET123' });
      expect(mfaRepository.markMfaVerified).toHaveBeenCalledWith('setting-1');
      expect(mfaRepository.enableMfaOnUser).toHaveBeenCalledWith('user-1');
    });

    it('returns true without re-marking verification when the setting is already verified', async () => {
      mfaRepository.findMfaSetting.mockResolvedValue({
        id: 'setting-1',
        secretEncrypted: 'SECRET123',
        isVerified: true,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });

      const result = await target.verifyTotp('user-1', '123456');

      expect(result).toBe(true);
      expect(mfaRepository.markMfaVerified).not.toHaveBeenCalled();
      expect(mfaRepository.enableMfaOnUser).not.toHaveBeenCalled();
    });

    it('returns false when the code does not match', async () => {
      mfaRepository.findMfaSetting.mockResolvedValue({
        id: 'setting-1',
        secretEncrypted: 'SECRET123',
        isVerified: false,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

      const result = await target.verifyTotp('user-1', '000000');

      expect(result).toBe(false);
      expect(mfaRepository.markMfaVerified).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when TOTP has not been set up', async () => {
      mfaRepository.findMfaSetting.mockResolvedValue(null);

      await expect(target.verifyTotp('user-1', '123456')).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateBackupCodes', () => {
    it('generates 10 hashed backup codes and returns the plaintext codes', async () => {
      mfaRepository.findMfaSetting.mockResolvedValue({
        id: 'setting-1',
        secretEncrypted: 'SECRET123',
        isVerified: true,
      });
      hashingService.hash.mockImplementation((code: string) => Promise.resolve(`hashed-${code}`));

      const codes = await target.generateBackupCodes('user-1');

      expect(codes).toHaveLength(10);
      codes.forEach(code => {
        expect(code).toMatch(/^[0-9A-F]{8}$/);
      });
      expect(hashingService.hash).toHaveBeenCalledTimes(10);
      expect(mfaRepository.updateBackupCodes).toHaveBeenCalledWith(
        'setting-1',
        codes.map(code => `hashed-${code}`)
      );
    });

    it('throws BadRequestException when TOTP has not been set up', async () => {
      mfaRepository.findMfaSetting.mockResolvedValue(null);

      await expect(target.generateBackupCodes('user-1')).rejects.toThrow(BadRequestException);
      expect(mfaRepository.updateBackupCodes).not.toHaveBeenCalled();
    });
  });
});

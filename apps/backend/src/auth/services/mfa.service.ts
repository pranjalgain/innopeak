import { HashingService } from '@common/hashing/hashing.service';
import { MfaRepository } from '@db/repositories/auth/mfa.repository';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';

import { randomBytes } from 'crypto';

@Injectable()
export class MfaService {
  private readonly appName = 'NestJS App';

  constructor(
    private readonly mfaRepository: MfaRepository,
    private readonly hashingService: HashingService
  ) {}

  /**
   * Sets up TOTP-based MFA for a user.
   * Generates a secret, creates an otpauth URL, and produces a QR code for scanning.
   * The secret is stored (encrypted) in the database.
   */
  async setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string; qrCode: string }> {
    // Verify user exists
    const user = await this.mfaRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: this.appName,
      label: user.email,
      secret,
    });
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    // Upsert the TOTP setting (creates or updates)
    await this.mfaRepository.upsertMfaSetting(userId, 'totp', secret);

    return { secret, otpauthUrl, qrCode };
  }

  /**
   * Verifies a TOTP code against the user's stored secret.
   * Marks the MFA setting as verified on first successful verification.
   */
  async verifyTotp(userId: string, code: string): Promise<boolean> {
    const setting = await this.mfaRepository.findMfaSetting(userId, 'totp');
    if (!setting) {
      throw new BadRequestException('TOTP has not been set up for this user');
    }

    const result = await otpVerify({
      token: code,
      secret: setting.secretEncrypted,
    });

    const isValid = result.valid;

    if (isValid && !setting.isVerified) {
      // Mark as verified and enable MFA on the user record
      await this.mfaRepository.markMfaVerified(setting.id);
      await this.mfaRepository.enableMfaOnUser(userId);
    }

    return isValid;
  }

  /**
   * Generates 10 backup codes for MFA recovery.
   * Each code is hashed before storage; plaintext codes are returned only once.
   */
  async generateBackupCodes(userId: string): Promise<string[]> {
    const setting = await this.mfaRepository.findMfaSetting(userId, 'totp');
    if (!setting) {
      throw new BadRequestException('TOTP has not been set up for this user');
    }

    const codes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
      const hashed = await this.hashingService.hash(code);
      hashedCodes.push(hashed);
    }

    await this.mfaRepository.updateBackupCodes(setting.id, hashedCodes);

    return codes;
  }
}

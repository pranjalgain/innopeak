import { HashingService } from '@common/hashing/hashing.service';
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * Above bcrypt's default of 10. The cost is stored in each hash, so existing hashes keep
 * verifying at their old factor. Login's decoy comparison for an unknown email derives from this
 * service so its timing can't drift from a real one.
 */
const BCRYPT_COST_FACTOR = 12;

@Injectable()
export class BcryptService implements HashingService {
  async hash(data: string): Promise<string> {
    const saltOrRounds = await bcrypt.genSalt(BCRYPT_COST_FACTOR);
    return bcrypt.hash(data, saltOrRounds);
  }

  async compare(data: Buffer | string, encrypted: string): Promise<boolean> {
    return bcrypt.compare(data, encrypted);
  }
}

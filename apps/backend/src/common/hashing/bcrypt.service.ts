import { HashingService } from '@common/hashing/hashing.service';
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * Deliberately above bcrypt's built-in default of 10. The cost is stored inside each hash, so
 * raising it is backward compatible — existing hashes keep verifying at the factor they were
 * written with, and are rewritten at this one whenever the password next changes.
 *
 * Also load-bearing for login's timing behaviour: the decoy comparison on an unknown email has to
 * cost the same as a real one, and it derives from this same service so the two can never drift.
 */
const BCRYPT_COST_FACTOR = 12;

@Injectable()
export class BcryptService implements HashingService {
  /**
   * Hashes a string using bcrypt.
   * @param data - The string to be hashed.
   * @returns A Promise that resolves to the hashed string.
   */
  async hash(data: string): Promise<string> {
    // Generate a salt for password hashing
    const saltOrRounds = await bcrypt.genSalt(BCRYPT_COST_FACTOR);
    // Hash the password using the generated salt
    return bcrypt.hash(data, saltOrRounds);
  }

  /**
   * Compare the provided data with the encrypted value.
   * @param data - The data to compare.
   * @param encrypted - The encrypted value to compare against.
   * @returns A Promise that resolves to true if the data matches the encrypted value, or false otherwise.
   */
  async compare(data: Buffer | string, encrypted: string): Promise<boolean> {
    return bcrypt.compare(data, encrypted);
  }
}

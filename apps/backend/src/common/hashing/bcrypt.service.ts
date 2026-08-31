import { HashingService } from '@common/hashing/hashing.service';
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class BcryptService implements HashingService {
  /**
   * Hashes a string using bcrypt.
   * @param data - The string to be hashed.
   * @returns A Promise that resolves to the hashed string.
   */
  async hash(data: string): Promise<string> {
    // Generate a salt for password hashing
    const saltOrRounds = await bcrypt.genSalt();
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

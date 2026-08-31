import * as bcrypt from 'bcrypt';

import * as crypto from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Generates a cryptographically secure random password
 * @param length The length of the password (default: 8)
 * @returns A random password string
 */
export function generateRandomPassword(length: number = 8): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  const charsetLength = charset.length;

  return crypto.randomBytes(length).reduce((acc, byte) => acc + charset[byte % charsetLength], '');
}

/**
 * Hashes a password using bcrypt
 * @param password The plain text password to hash
 * @returns A promise that resolves to the hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plain text password with a hashed password
 * @param password The plain text password
 * @param hashedPassword The hashed password to compare against
 * @returns A promise that resolves to true if the passwords match, false otherwise
 */
export async function comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

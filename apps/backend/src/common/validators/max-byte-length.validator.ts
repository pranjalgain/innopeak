import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Caps a string by its UTF-8 *bytes*, not its characters. bcrypt reads only the first 72 bytes of a password and ignores the rest,
 * so a longer one is silently truncated: two different 100-character passwords sharing their first 72 bytes would verify against
 * each other. Counting bytes (an accented character is two) is what makes the cap exact.
 */
export function MaxByteLength(
  maxBytes: number,
  validationOptions?: ValidationOptions
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'maxByteLength',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [maxBytes],
      ...(validationOptions === undefined ? {} : { options: validationOptions }),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maxBytes;
        },
      },
    });
  };
}

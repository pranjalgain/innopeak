import { validate } from 'class-validator';

import { MaxByteLength } from './max-byte-length.validator';

class Sample {
  @MaxByteLength(4, { message: 'too long' })
  value!: string;
}

const check = async (value: unknown): Promise<string[]> => {
  const sample = new Sample();
  sample.value = value as string;
  return (await validate(sample)).flatMap(error => Object.values(error.constraints ?? {}));
};

describe('MaxByteLength', () => {
  it('accepts a string whose UTF-8 size is at the limit', async () => {
    await expect(check('abcd')).resolves.toEqual([]);
  });

  it('refuses a string one byte over', async () => {
    await expect(check('abcde')).resolves.toEqual(['too long']);
  });

  // Four characters, but eight bytes: a character cap would have let this through.
  it('counts bytes, not characters', async () => {
    await expect(check('äöüß')).resolves.toEqual(['too long']);
    await expect(check('äö')).resolves.toEqual([]);
  });

  it('refuses a value that is not a string', async () => {
    await expect(check(123)).resolves.toEqual(['too long']);
  });
});

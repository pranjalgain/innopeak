import { keyofValue, omitFields } from './helper';

describe('keyofValue', () => {
  it('returns a proxy whose property access yields the property name itself', () => {
    interface Sample {
      id: string;
      email: string;
      createdAt: Date;
    }

    const keys = keyofValue<Sample>({} as Sample);

    expect(keys.id).toBe('id');
    expect(keys.email).toBe('email');
    expect(keys.createdAt).toBe('createdAt');
  });

  it('does not depend on the values of the object passed in', () => {
    interface Sample {
      foo: number;
    }

    const keys = keyofValue<Sample>({ foo: 42 });

    expect(keys.foo).toBe('foo');
  });

  it('resolves arbitrary property access dynamically via the proxy get trap', () => {
    const keys = keyofValue<Record<string, unknown>>({});

    expect(keys['anyDynamicKey']).toBe('anyDynamicKey');
  });
});

describe('omitFields', () => {
  it('returns a new object without the specified fields', () => {
    const input = { id: '1', email: 'a@b.com', passwordHash: 'secret' };

    const result = omitFields(input, ['passwordHash']);

    expect(result).toEqual({ id: '1', email: 'a@b.com' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('omits multiple fields at once', () => {
    const input = { a: 1, b: 2, c: 3, d: 4 };

    const result = omitFields(input, ['b', 'd']);

    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('does not mutate the original object', () => {
    const input = { a: 1, b: 2 };

    const result = omitFields(input, ['b']);

    expect(input).toEqual({ a: 1, b: 2 });
    expect(result).toEqual({ a: 1 });
  });

  it('returns an equivalent shallow copy when no fields are omitted', () => {
    const input = { a: 1, b: 2 };

    const result = omitFields(input, []);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });
});

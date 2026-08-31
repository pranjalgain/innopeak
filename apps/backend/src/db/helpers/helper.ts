type KeyOfValue<T> = {
  [P in keyof T]: P;
};

export function keyofValue<T>(_obj: T): KeyOfValue<T> {
  return new Proxy({} as KeyOfValue<T>, {
    get: (_, prop: string) => prop,
  });
}

export function omitFields<T, K extends keyof T>(obj: T, fieldsToOmit: K[]): Omit<T, K> {
  const result: Omit<T, K> = { ...obj };

  for (const field of fieldsToOmit) {
    delete (result as T)[field];
  }

  return result;
}

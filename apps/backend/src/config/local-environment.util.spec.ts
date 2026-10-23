import { isHttpsUrl, isLocalUrl } from './local-environment.util';

describe('isLocalUrl', () => {
  it.each([
    'http://localhost:3002',
    'http://localhost',
    'http://127.0.0.1:3000',
    'http://127.5.6.7',
    'http://[::1]:3000',
    'http://app.localhost:3002',
    'HTTP://LOCALHOST:3002',
  ])('treats %s as local', url => {
    expect(isLocalUrl(url)).toBe(true);
  });

  // A bare local setup has no URL configured at all.
  it.each([undefined, null, '', '   '])('treats an unset URL (%p) as local', url => {
    expect(isLocalUrl(url)).toBe(true);
  });

  it.each([
    'https://staging.innopeak.io',
    'https://app.example.com',
    'http://192.168.1.20:3002',
    'http://10.0.0.5',
    // A host that merely contains the word is not loopback.
    'https://localhost.evil.com',
    'https://evil-localhost.com',
    'http://127.0.0.1.evil.com',
  ])('treats %s as not local', url => {
    expect(isLocalUrl(url)).toBe(false);
  });

  // Refusing a development convenience is the safe way to be wrong.
  it('treats a malformed value as not local', () => {
    expect(isLocalUrl('not a url')).toBe(false);
  });
});

describe('isHttpsUrl', () => {
  it('is true only for an https URL', () => {
    expect(isHttpsUrl('https://staging.innopeak.io')).toBe(true);
    expect(isHttpsUrl('HTTPS://app.example.com')).toBe(true);
    expect(isHttpsUrl('http://localhost:3002')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});

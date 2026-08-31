import type { Request } from 'express';

import { isMobileRequest } from './helpers';

describe('isMobileRequest', () => {
  it('returns true when the x-device header equals "mobile"', () => {
    const req = { headers: { 'x-device': 'mobile' } } as unknown as Request;
    expect(isMobileRequest(req)).toBe(true);
  });

  it('returns false when the x-device header is a different value', () => {
    const req = { headers: { 'x-device': 'desktop' } } as unknown as Request;
    expect(isMobileRequest(req)).toBe(false);
  });

  it('returns false when the x-device header is absent', () => {
    const req = { headers: {} } as unknown as Request;
    expect(isMobileRequest(req)).toBe(false);
  });

  it('returns false when the x-device header is an empty string', () => {
    const req = { headers: { 'x-device': '' } } as unknown as Request;
    expect(isMobileRequest(req)).toBe(false);
  });

  it('returns false when x-device is an array not equal to "mobile"', () => {
    const req = { headers: { 'x-device': ['mobile', 'other'] } } as unknown as Request;
    expect(isMobileRequest(req)).toBe(false);
  });
});

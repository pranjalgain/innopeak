import { safeReferrer, safeUrl } from './safe-url.util';

describe('safeUrl', () => {
  it('drops the query string, so OAuth `code` and `state` never reach a log', () => {
    expect(safeUrl('/v1/auth/google/callback?code=abc&state=def')).toBe('/v1/auth/google/callback');
  });

  it('redacts an invite token but keeps the rest of the path', () => {
    expect(safeUrl('/v1/admin/auth/invite/raw-token/google')).toBe(
      '/v1/admin/auth/invite/[REDACTED]/google'
    );
  });

  it('leaves the accept route alone: its token travels in the body', () => {
    expect(safeUrl('/v1/auth/invite/accept')).toBe('/v1/auth/invite/accept');
  });
});

describe('safeReferrer', () => {
  it('redacts the token of the web invite page and drops its query', () => {
    expect(safeReferrer('https://app.example.com/accept-invite/raw-token?x=1')).toBe(
      'https://app.example.com/accept-invite/[REDACTED]'
    );
  });

  it('drops a Stripe session id carried in the query', () => {
    expect(safeReferrer('https://app.example.com/settings?checkout=success&session_id=cs_1')).toBe(
      'https://app.example.com/settings'
    );
  });

  it('passes the "No Referer" placeholder through', () => {
    expect(safeReferrer('No Referer')).toBe('No Referer');
  });
});

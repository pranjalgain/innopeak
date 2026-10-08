import { createHash, createSign, generateKeyPairSync, randomBytes } from 'crypto';

import { Router, type Request } from 'express';

/**
 * A local stand-in for Microsoft's identity platform (`login.microsoftonline.com/common`), so the
 * backend's real `MicrosoftOidcProvider` — PKCE, nonce, ID-token signature, audience and issuer
 * checks — runs end to end without an Azure app. Point `MICROSOFT_AUTHORITY` at
 * `http://localhost:4100/microsoft/common`.
 *
 * Enforces what the real service does and the backend relies on: the `code` is single-use, the
 * `redirect_uri` must match, and a PKCE `code_verifier` must hash to the challenge. The ID token is
 * genuinely RS256-signed with a key generated at startup and published at the JWKS route.
 */
export const microsoftRouter = Router();

/** The tenant id Microsoft uses for every personal (consumer) account. */
const PERSONAL_ACCOUNT_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const PERSONAL_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com']);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY_ID = randomBytes(8).toString('hex');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KEY_ID, use: 'sig', alg: 'RS256' };

interface PendingCode {
  clientId: string;
  redirectUri: string;
  nonce: string;
  codeChallenge: string | undefined;
  identity: MockIdentity;
}

interface MockIdentity {
  email: string;
  name: string;
  sub: string;
  /** Whether to emit `xms_edov`, i.e. Microsoft vouching for the email's domain. */
  domainVerified: boolean;
}

const codes = new Map<string, PendingCode>();

export function resetMicrosoftMock(): void {
  codes.clear();
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const base64url = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

/** Same email always yields the same `sub`, like a real account, unless the form overrides it. */
const subFor = (clientId: string, email: string): string =>
  base64url(createHash('sha256').update(`${clientId}:${email.toLowerCase()}`).digest()).slice(0, 27);

function tenantIdFor(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (PERSONAL_DOMAINS.has(domain)) {
    return PERSONAL_ACCOUNT_TID;
  }
  // A stable GUID-shaped id per work domain.
  const hex = createHash('sha256').update(domain).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function origin(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? 'localhost:4100'}`;
}

function signIdToken(req: Request, pending: PendingCode): string {
  const now = Math.floor(Date.now() / 1000);
  const tid = tenantIdFor(pending.identity.email);
  const claims: Record<string, unknown> = {
    ver: '2.0',
    iss: `${origin(req)}/microsoft/${tid}/v2.0`,
    aud: pending.clientId,
    sub: pending.identity.sub,
    tid,
    oid: base64url(createHash('sha256').update(`oid:${pending.identity.sub}`).digest()).slice(0, 22),
    iat: now,
    nbf: now,
    exp: now + 3600,
    nonce: pending.nonce,
    email: pending.identity.email,
    name: pending.identity.name,
    preferred_username: pending.identity.email,
    ...(pending.identity.domainVerified ? { xms_edov: true } : {}),
  };
  const input = `${base64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: KEY_ID }))}.${base64url(JSON.stringify(claims))}`;
  return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
}

function field(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A tiny sign-in page so each scenario (new person, unverified email, existing account) is one click. */
microsoftRouter.get('/microsoft/common/oauth2/v2.0/authorize', (req, res) => {
  const q = req.query as Record<string, unknown>;
  const hidden = ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'code_challenge_method']
    .map(name => `<input type="hidden" name="${name}" value="${escapeHtml(field(q[name]))}">`)
    .join('');

  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Mock Microsoft sign-in</title>
<body style="font:15px system-ui;max-width:420px;margin:48px auto;line-height:1.5">
<h2>Mock Microsoft sign-in</h2>
<p>Local stand-in for login.microsoftonline.com. Pick the identity to return.</p>
<form method="post" action="/microsoft/common/oauth2/v2.0/authorize">${hidden}
<p><label>Email<br><input name="email" value="dev.user@outlook.com" style="width:100%"></label></p>
<p><label>Name<br><input name="name" value="Dev Microsoft User" style="width:100%"></label></p>
<p><label><input type="checkbox" name="domain_verified" checked> Email domain verified (emit <code>xms_edov</code>)</label></p>
<p><button type="submit">Sign in</button>
<button type="submit" name="deny" value="1">Cancel</button></p>
</form></body>`);
});

microsoftRouter.post('/microsoft/common/oauth2/v2.0/authorize', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const redirectUri = field(body['redirect_uri']);
  const state = field(body['state']);

  if (redirectUri === '') {
    res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri is required' });
    return;
  }

  const back = new URL(redirectUri);
  if (body['deny'] !== undefined) {
    back.searchParams.set('error', 'access_denied');
    back.searchParams.set('state', state);
    res.redirect(302, back.toString());
    return;
  }

  const clientId = field(body['client_id']);
  const email = field(body['email']).trim();
  const code = randomBytes(24).toString('base64url');
  codes.set(code, {
    clientId,
    redirectUri,
    nonce: field(body['nonce']),
    codeChallenge: field(body['code_challenge']) || undefined,
    identity: {
      email,
      name: field(body['name']) || email,
      sub: subFor(clientId, email),
      domainVerified: body['domain_verified'] !== undefined,
    },
  });

  back.searchParams.set('code', code);
  back.searchParams.set('state', state);
  res.redirect(302, back.toString());
});

microsoftRouter.post('/microsoft/common/oauth2/v2.0/token', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const fail = (error: string, description: string): void => {
    res.status(400).json({ error, error_description: description });
  };

  if (field(body['grant_type']) !== 'authorization_code') {
    fail('unsupported_grant_type', 'only authorization_code is supported');
    return;
  }
  if (field(body['client_secret']) === '') {
    fail('invalid_client', 'client_secret is required');
    return;
  }

  // Single-use, like the real service: a replayed code is `invalid_grant`.
  const pending = codes.get(field(body['code']));
  codes.delete(field(body['code']));
  if (pending === undefined) {
    fail('invalid_grant', 'the code is invalid, expired or already redeemed');
    return;
  }
  if (pending.clientId !== field(body['client_id']) || pending.redirectUri !== field(body['redirect_uri'])) {
    fail('invalid_grant', 'client_id or redirect_uri does not match the authorization request');
    return;
  }
  if (pending.codeChallenge !== undefined) {
    const verifier = field(body['code_verifier']);
    const expected = createHash('sha256').update(verifier).digest('base64url');
    if (verifier === '' || expected !== pending.codeChallenge) {
      fail('invalid_grant', 'PKCE verification failed');
      return;
    }
  }

  res.json({
    token_type: 'Bearer',
    scope: 'openid profile email',
    expires_in: 3599,
    access_token: 'mock-access-token',
    id_token: signIdToken(req, pending),
  });
});

microsoftRouter.get('/microsoft/common/discovery/v2.0/keys', (_req, res) => {
  res.json({ keys: [jwk] });
});

microsoftRouter.post('/microsoft/__reset', (_req, res) => {
  resetMicrosoftMock();
  res.status(204).end();
});

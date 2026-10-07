import type { IErasureNoticeEmailJob } from '@bg/interfaces/job.interface';

import { buildErasureNotice, buildPurgeAlert, escapeHtml } from './erasure-notice.copy';

const base: IErasureNoticeEmailJob = {
  kind: 'scheduled',
  email: 'jane@acme.test',
  customerName: 'Jane',
  businessName: 'Acme & <Sons>',
  locale: 'en',
  requestedBy: 'owner',
  restore: 'you',
  loginUrl: 'https://app.test/login',
  scheduledFor: '2026-10-27T09:00:00.000Z',
};

describe('buildErasureNotice', () => {
  it('escapes the business name in the body but keeps the subject plain text', () => {
    const content = buildErasureNotice(base);

    expect(content.subject).toBe('Acme & <Sons> is scheduled for deletion');
    expect(content.body).toContain('Acme &amp; &lt;Sons&gt;');
    expect(content.body).not.toContain('<Sons>');
  });

  it('keeps a hostile name on one subject line', () => {
    const content = buildErasureNotice({ ...base, businessName: 'Acme\r\nBcc: evil@x.test' });

    expect(content.subject).not.toMatch(/[\r\n]/);
  });

  it('offers sign-in only to the owner who can actually restore it', () => {
    const you = buildErasureNotice(base);
    expect(you.actionUrl).toBe('https://app.test/login');
    expect(you.body).toContain('You asked for this');

    const other = buildErasureNotice({ ...base, restore: 'requester' });
    expect(other.actionUrl).toBeUndefined();
    expect(other.body).toContain('Another owner of the business asked for this');

    const sso = buildErasureNotice({ ...base, restore: 'support' });
    expect(sso.actionUrl).toBeUndefined();
    expect(sso.body).toContain('cannot restore it themselves');
  });

  it('says a platform administrator asked for an admin-requested erasure, with no sign-in prompt', () => {
    const content = buildErasureNotice({ ...base, requestedBy: 'admin', restore: 'support' });

    expect(content.actionUrl).toBeUndefined();
    expect(content.body).toContain('platform administrator');
  });

  it('gives a German co-owner the German explanation', () => {
    const de = buildErasureNotice({ ...base, locale: 'de', restore: 'requester' });

    expect(de.body).toContain('Eine andere Inhaberin oder ein anderer Inhaber');
  });

  it('writes the deadline in the recipient’s language', () => {
    expect(buildErasureNotice(base).body).toContain('27 October 2026');
    const de = buildErasureNotice({ ...base, locale: 'de' });
    expect(de.body).toContain('27. Oktober 2026');
    expect(de.subject).toContain('zur Löschung vorgemerkt');
  });

  it('counts the days left for a reminder, never below one', () => {
    const now = new Date('2026-10-24T09:00:00.000Z').getTime();
    expect(buildErasureNotice({ ...base, kind: 'reminder' }, now).body).toContain(
      '3 days from now'
    );
    expect(
      buildErasureNotice(
        { ...base, kind: 'reminder', scheduledFor: '2026-10-24T10:00:00.000Z' },
        now
      ).body
    ).toContain('1 day from now');
    expect(buildErasureNotice({ ...base, kind: 'reminder', locale: 'de' }, now).body).toContain(
      'in 3 Tagen'
    );
  });

  it('says the business is active again for cancelled, and offers no deadline', () => {
    const content = buildErasureNotice({ ...base, kind: 'cancelled' });

    expect(content.title).toBe('Deletion cancelled');
    expect(content.body).toContain('active again');
  });

  it('gives the erased confirmation no action link', () => {
    const content = buildErasureNotice({ ...base, kind: 'erased' });

    expect(content.title).toBe('Business erased');
    expect(content.actionUrl).toBeUndefined();
  });

  it('falls back to a neutral greeting without a name', () => {
    const { customerName: _omit, ...noName } = base;

    expect(buildErasureNotice(noName).body).toContain('Hi there,');
    expect(buildErasureNotice({ ...noName, locale: 'de' }).body).toContain('Hallo dort,');
  });
});

describe('buildPurgeAlert', () => {
  const skipped = [
    { name: 'Acme <b>', daysOverdue: 0, reason: 'Stripe said <script>alert(1)</script>' },
    { name: 'Beta', daysOverdue: 3, reason: 'boom' },
  ];

  it('lists every skipped business with how overdue it is, escaping name and reason', () => {
    const content = buildPurgeAlert({ email: 'a@b.c', locale: 'en', skipped });

    expect(content.subject).toBe('Action needed: 2 erasures could not be completed');
    expect(content.body).toContain('Acme &lt;b&gt;');
    expect(content.body).toContain('due today');
    expect(content.body).toContain('3 days past its deadline');
    expect(content.body).not.toContain('<script>');
  });

  it('speaks German to a German admin and uses the singular for one business', () => {
    const content = buildPurgeAlert({ email: 'a@b.c', locale: 'de', skipped: [skipped[1]!] });

    expect(content.subject).toContain('1 Löschung konnte nicht');
    expect(content.body).toContain('3 Tage über der Frist');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });
});

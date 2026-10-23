import { buildMemberInvite } from './member-invite.copy';

const base = {
  email: 'sam@example.com',
  inviteLink: 'https://app.example.com/accept-invite/tok',
  expiresIn: '7 days',
};

describe('buildMemberInvite', () => {
  it('speaks German to an invite sent by a German-speaking owner, subject included', () => {
    const content = buildMemberInvite(
      { ...base, businessName: 'Café Süd', locale: 'de' },
      'InnoPeak'
    );

    expect(content.subject).toBe('Einladung: Treten Sie Café Süd auf InnoPeak bei');
    expect(content.title).toBe('Sie sind eingeladen');
    expect(content.actionText).toBe('Einladung annehmen');
    expect(content.body).toContain('Sie wurden eingeladen');
  });

  it('defaults to English', () => {
    const content = buildMemberInvite({ ...base, businessName: 'The Coffee House' }, 'InnoPeak');

    expect(content.subject).toBe("You've been invited to join The Coffee House on InnoPeak");
    expect(content.actionText).toBe('Accept invite');
  });

  // Replaces the English-only "your team" literal the service used to send in any language.
  it.each([
    ['en', 'a team'],
    ['de', 'einem Team'],
  ] as const)('reads as a team when there is no business name (%s)', (locale, team) => {
    const content = buildMemberInvite({ ...base, locale }, 'InnoPeak');

    expect(content.body).toContain(`<strong>${team}</strong>`);
    expect(content.subject).toContain(locale === 'de' ? 'einem Team' : 'a team');
  });

  it('escapes the business name and the link, and keeps the subject on one line', () => {
    const content = buildMemberInvite(
      { ...base, inviteLink: 'https://x.test/?a=1&b="2"', businessName: '<b>Evil</b>\nCafé' },
      'InnoPeak'
    );

    expect(content.body).toContain('&lt;b&gt;Evil&lt;/b&gt; Café');
    expect(content.body).toContain('a=1&amp;b=&quot;2&quot;');
    expect(content.body).not.toContain('<b>Evil');
    expect(content.subject).not.toContain('\n');
    expect(content.actionUrl).toBe('https://x.test/?a=1&b="2"');
  });
});

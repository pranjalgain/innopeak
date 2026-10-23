import type { IMemberInviteEmailJob } from '@bg/interfaces/job.interface';
import { escapeHtml } from '@email-queue/erasure-notice.copy';

export interface MemberInviteContent {
  subject: string;
  title: string;
  /** Trusted HTML: every interpolated value is escaped on the way in. */
  body: string;
  actionText: string;
  actionUrl: string;
}

interface Strings {
  subject: (business: string, appName: string) => string;
  subjectUnnamed: (appName: string) => string;
  title: string;
  /** Stands in for the business name when the invite cannot name one. */
  aTeam: string;
  intro: (business: string, appName: string, expiresIn: string) => string;
  action: string;
  fallback: string;
  ignore: string;
  signOff: (appName: string) => string;
  defaultExpiry: string;
}

const EN: Strings = {
  subject: (business, appName) => `You've been invited to join ${business} on ${appName}`,
  subjectUnnamed: appName => `You've been invited to join a team on ${appName}`,
  title: "You're invited",
  aTeam: 'a team',
  intro: (business, appName, expiresIn) =>
    `You've been invited to join <strong>${business}</strong> on ${appName}. Use the button below to set up your account. This link expires in ${expiresIn}.`,
  action: 'Accept invite',
  fallback: 'If the button does not work, copy this link into your browser:',
  ignore:
    "If you weren't expecting this invite, you can safely ignore this email. No account is created until you complete the steps above.",
  signOff: appName => `Best regards,<br />The ${appName} team`,
  defaultExpiry: '7 days',
};

const DE: Strings = {
  subject: (business, appName) => `Einladung: Treten Sie ${business} auf ${appName} bei`,
  subjectUnnamed: appName => `Einladung: Treten Sie einem Team auf ${appName} bei`,
  title: 'Sie sind eingeladen',
  aTeam: 'einem Team',
  intro: (business, appName, expiresIn) =>
    `Sie wurden eingeladen, <strong>${business}</strong> auf ${appName} beizutreten. Richten Sie Ihr Konto mit der Schaltfläche unten ein. Dieser Link läuft in ${expiresIn} ab.`,
  action: 'Einladung annehmen',
  fallback: 'Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:',
  ignore:
    'Wenn Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren. Ohne die genannten Schritte wird kein Konto angelegt.',
  signOff: appName => `Viele Grüße<br />Ihr ${appName}-Team`,
  defaultExpiry: '7 Tagen',
};

/** A subject must be one line whatever the business was named. */
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

/**
 * Rendered from the payload alone, in the inviting owner's language (the invitee has none yet). A blank business name reads as a team
 * rather than leaving a hole, and every interpolated value is escaped: the name is owner-supplied and the link is a URL.
 */
export function buildMemberInvite(
  job: IMemberInviteEmailJob,
  appName: string
): MemberInviteContent {
  const s = job.locale === 'de' ? DE : EN;
  const businessName = oneLine(job.businessName ?? '');
  const business = businessName ? escapeHtml(businessName) : s.aTeam;
  const link = escapeHtml(job.inviteLink);

  return {
    subject: businessName ? s.subject(businessName, appName) : s.subjectUnnamed(appName),
    title: s.title,
    body: [
      `<p>${s.intro(business, escapeHtml(appName), escapeHtml(job.expiresIn ?? s.defaultExpiry))}</p>`,
      `<p>${s.fallback}</p><p style="word-break: break-all;">${link}</p>`,
      `<p>${s.ignore}</p>`,
      `<p>${s.signOff(escapeHtml(appName))}</p>`,
    ].join(''),
    actionText: s.action,
    actionUrl: job.inviteLink,
  };
}

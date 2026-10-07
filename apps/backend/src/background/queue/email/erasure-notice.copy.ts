import type {
  IErasureNoticeEmailJob,
  IErasurePurgeAlertEmailJob,
} from '@bg/interfaces/job.interface';
import { APP_NAME } from '@common/constants/app.constants';

export interface ErasureNoticeContent {
  subject: string;
  title: string;
  /** Trusted HTML — every interpolated value is escaped on the way in. */
  body: string;
  actionText?: string;
  actionUrl?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The business name is user-typed and lands in an HTML body (`{{{body}}}`), so it must be escaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string, locale: 'de' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

const p = (text: string): string => `<p>${text}</p>`;

/** A subject must be one line whatever the business was named. */
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

interface Strings {
  greeting: (name: string) => string;
  signOff: string;
  scheduled: {
    subject: (business: string) => string;
    title: string;
    intro: (business: string, date: string) => string;
    byYou: (date: string) => string;
    byOtherOwner: (date: string) => string;
    byOwnerNeedsSupport: (date: string) => string;
    byAdmin: (date: string) => string;
    unexpected: string;
    billing: string;
    action: string;
  };
  reminder: {
    subject: (business: string, date: string) => string;
    title: string;
    intro: (business: string, date: string, days: number) => string;
  };
  cancelled: {
    subject: (business: string) => string;
    title: string;
    body: (business: string) => string;
    unexpected: string;
  };
  erased: {
    subject: (business: string) => string;
    title: string;
    body: (business: string) => string;
    retained: string;
  };
}

const EN: Strings = {
  greeting: name => `Hi ${name},`,
  signOff: `Best regards,<br />The ${APP_NAME} Team`,
  scheduled: {
    subject: business => `${business} is scheduled for deletion`,
    title: 'Deletion scheduled',
    intro: (business, date) =>
      `<strong>${business}</strong> has been suspended and will be permanently erased on <strong>${date}</strong>, together with its reviews, replies, settings and team accounts.`,
    byYou: date =>
      `You asked for this. Until ${date} you can undo it: sign in with your email and password and choose “Restore my business”.`,
    byOtherOwner: date =>
      `Another owner of the business asked for this. Until ${date} only that owner can undo it, by signing in with their password and choosing “Restore my business”. To undo it any other way, contact ${APP_NAME} support.`,
    byOwnerNeedsSupport: date =>
      `An owner of the business asked for this, and cannot restore it themselves. To undo it before ${date}, contact ${APP_NAME} support.`,
    byAdmin: date =>
      `The request was made by a platform administrator. To undo it before ${date}, contact ${APP_NAME} support.`,
    unexpected: `If you did not expect this, or cannot sign in, contact ${APP_NAME} support straight away.`,
    billing:
      'A paid subscription stops renewing and simply ends with the period that is already paid for.',
    action: 'Go to sign in',
  },
  reminder: {
    subject: (business, date) => `Reminder: ${business} will be erased on ${date}`,
    title: 'Deletion reminder',
    intro: (business, date, days) =>
      `This is a reminder that <strong>${business}</strong> will be permanently erased on <strong>${date}</strong> — ${days} ${days === 1 ? 'day' : 'days'} from now. After that its reviews, replies, settings and team accounts cannot be recovered.`,
  },
  cancelled: {
    subject: business => `${business} has been restored`,
    title: 'Deletion cancelled',
    body: business =>
      `The scheduled deletion of <strong>${business}</strong> has been cancelled. The business is active again and your team can sign in.`,
    unexpected: `If you did not expect this, contact ${APP_NAME} support straight away.`,
  },
  erased: {
    subject: business => `${business} has been erased`,
    title: 'Business erased',
    body: business =>
      `<strong>${business}</strong> and its data have been permanently erased, as scheduled. This is the last message you will receive about it.`,
    retained:
      'Records we are legally required to keep, such as payment invoices, are retained as the law requires.',
  },
};

const DE: Strings = {
  greeting: name => `Hallo ${name},`,
  signOff: `Viele Grüße<br />Ihr ${APP_NAME}-Team`,
  scheduled: {
    subject: business => `${business} ist zur Löschung vorgemerkt`,
    title: 'Löschung vorgemerkt',
    intro: (business, date) =>
      `<strong>${business}</strong> wurde gesperrt und wird am <strong>${date}</strong> endgültig gelöscht – zusammen mit allen Bewertungen, Antworten, Einstellungen und Teamkonten.`,
    byYou: date =>
      `Sie haben die Löschung veranlasst. Bis zum ${date} können Sie sie rückgängig machen: Melden Sie sich mit E-Mail und Passwort an und wählen Sie „Mein Unternehmen wiederherstellen“.`,
    byOtherOwner: date =>
      `Eine andere Inhaberin oder ein anderer Inhaber des Unternehmens hat die Löschung veranlasst. Bis zum ${date} kann nur diese Person sie rückgängig machen, indem sie sich mit ihrem Passwort anmeldet und „Mein Unternehmen wiederherstellen“ wählt. Für alles andere wenden Sie sich an den ${APP_NAME}-Support.`,
    byOwnerNeedsSupport: date =>
      `Eine Inhaberin oder ein Inhaber des Unternehmens hat die Löschung veranlasst und kann sie nicht selbst rückgängig machen. Um sie vor dem ${date} rückgängig zu machen, wenden Sie sich an den ${APP_NAME}-Support.`,
    byAdmin: date =>
      `Die Löschung wurde von einem Plattform-Administrator veranlasst. Um sie vor dem ${date} rückgängig zu machen, wenden Sie sich an den ${APP_NAME}-Support.`,
    unexpected: `Falls Sie damit nicht gerechnet haben oder sich nicht anmelden können, wenden Sie sich bitte umgehend an den ${APP_NAME}-Support.`,
    billing:
      'Ein kostenpflichtiges Abonnement wird nicht mehr verlängert und endet mit dem bereits bezahlten Zeitraum.',
    action: 'Zur Anmeldung',
  },
  reminder: {
    subject: (business, date) => `Erinnerung: ${business} wird am ${date} gelöscht`,
    title: 'Erinnerung an die Löschung',
    intro: (business, date, days) =>
      `Zur Erinnerung: <strong>${business}</strong> wird am <strong>${date}</strong> endgültig gelöscht – in ${days} ${days === 1 ? 'Tag' : 'Tagen'}. Danach lassen sich Bewertungen, Antworten, Einstellungen und Teamkonten nicht mehr wiederherstellen.`,
  },
  cancelled: {
    subject: business => `${business} wurde wiederhergestellt`,
    title: 'Löschung abgebrochen',
    body: business =>
      `Die geplante Löschung von <strong>${business}</strong> wurde abgebrochen. Das Unternehmen ist wieder aktiv und Ihr Team kann sich anmelden.`,
    unexpected: `Falls Sie damit nicht gerechnet haben, wenden Sie sich bitte umgehend an den ${APP_NAME}-Support.`,
  },
  erased: {
    subject: business => `${business} wurde gelöscht`,
    title: 'Unternehmen gelöscht',
    body: business =>
      `<strong>${business}</strong> und alle zugehörigen Daten wurden wie geplant endgültig gelöscht. Dies ist die letzte Nachricht dazu.`,
    retained:
      'Unterlagen, die wir gesetzlich aufbewahren müssen, etwa Zahlungsbelege, bleiben im gesetzlich vorgeschriebenen Umfang erhalten.',
  },
};

/** The sentence telling this recipient who can undo the erasure, and how — see `restore`. */
function whoCanUndo(s: Strings, job: IErasureNoticeEmailJob, date: string): string {
  if (job.requestedBy === 'admin') {
    return s.scheduled.byAdmin(date);
  }
  switch (job.restore) {
    case 'you':
      return s.scheduled.byYou(date);
    case 'requester':
      return s.scheduled.byOtherOwner(date);
    case 'support':
      return s.scheduled.byOwnerNeedsSupport(date);
  }
}

/**
 * Plain functions over a payload that already carries everything, so rendering needs no database: the
 * `erased` notice goes out after its recipients have been anonymized.
 */
export function buildErasureNotice(
  job: IErasureNoticeEmailJob,
  now: number = Date.now()
): ErasureNoticeContent {
  const s = job.locale === 'de' ? DE : EN;
  const business = escapeHtml(job.businessName);
  const rawBusiness = oneLine(job.businessName);
  const date = job.scheduledFor ? formatDate(job.scheduledFor, job.locale) : '';
  const greeting = p(
    s.greeting(escapeHtml(job.customerName ?? (job.locale === 'de' ? 'dort' : 'there')))
  );
  const wrap = (paragraphs: string[]): string =>
    [greeting, ...paragraphs.map(p), p(s.signOff)].join('');

  switch (job.kind) {
    case 'scheduled': {
      const who = whoCanUndo(s, job, date);
      return {
        subject: s.scheduled.subject(rawBusiness),
        title: s.scheduled.title,
        body: wrap([
          s.scheduled.intro(business, date),
          who,
          s.scheduled.billing,
          s.scheduled.unexpected,
        ]),
        ...(job.restore === 'you'
          ? { actionText: s.scheduled.action, actionUrl: job.loginUrl }
          : {}),
      };
    }
    case 'reminder': {
      const days = Math.max(
        1,
        Math.ceil((new Date(job.scheduledFor ?? now).getTime() - now) / DAY_MS)
      );
      return {
        subject: s.reminder.subject(rawBusiness, date),
        title: s.reminder.title,
        body: wrap([
          s.reminder.intro(business, date, days),
          whoCanUndo(s, job, date),
          s.scheduled.unexpected,
        ]),
        ...(job.restore === 'you'
          ? { actionText: s.scheduled.action, actionUrl: job.loginUrl }
          : {}),
      };
    }
    case 'cancelled':
      return {
        subject: s.cancelled.subject(rawBusiness),
        title: s.cancelled.title,
        body: wrap([s.cancelled.body(business), s.cancelled.unexpected]),
        actionText: s.scheduled.action,
        actionUrl: job.loginUrl,
      };
    case 'erased':
      return {
        subject: s.erased.subject(rawBusiness),
        title: s.erased.title,
        body: wrap([s.erased.body(business), s.erased.retained]),
      };
  }
}

interface PurgeAlertStrings {
  subject: (count: number) => string;
  title: string;
  intro: (count: number) => string;
  row: (name: string, days: number, reason: string) => string;
  outro: string;
  greeting: string;
  signOff: string;
}

const PURGE_ALERT_EN: PurgeAlertStrings = {
  subject: count =>
    `Action needed: ${count} erasure${count === 1 ? '' : 's'} could not be completed`,
  title: 'Erasure purge incomplete',
  intro: count =>
    `Tonight's erasure purge could not release ${count} business${count === 1 ? '' : 'es'}. Nothing was anonymized for ${count === 1 ? 'it' : 'them'}; the purge will try again tomorrow night and you will be emailed each night until it succeeds.`,
  row: (name, days, reason) =>
    `<strong>${name}</strong> — ${days === 0 ? 'due today' : `${days} day${days === 1 ? '' : 's'} past its deadline`}<br />Reason: ${reason}`,
  outro:
    'Fix the cause (for example a payment-provider or Google outage, or a revoked credential) and the next run will complete it. The deletion deadline is a compliance commitment, so please do not leave this.',
  greeting: 'Hi,',
  signOff: `Best regards,<br />The ${APP_NAME} Team`,
};

const PURGE_ALERT_DE: PurgeAlertStrings = {
  subject: count =>
    `Handlungsbedarf: ${count} Löschung${count === 1 ? '' : 'en'} konnte${count === 1 ? '' : 'n'} nicht abgeschlossen werden`,
  title: 'Löschlauf unvollständig',
  intro: count =>
    `Der nächtliche Löschlauf konnte ${count} Unternehmen nicht freigeben. Es wurde nichts anonymisiert; der Lauf versucht es morgen Nacht erneut, und Sie erhalten jede Nacht eine E-Mail, bis es gelingt.`,
  row: (name, days, reason) =>
    `<strong>${name}</strong> — ${days === 0 ? 'heute fällig' : `${days} ${days === 1 ? 'Tag' : 'Tage'} über der Frist`}<br />Grund: ${reason}`,
  outro:
    'Beheben Sie die Ursache (zum Beispiel einen Ausfall beim Zahlungsanbieter oder bei Google oder einen widerrufenen Zugang), dann schließt der nächste Lauf die Löschung ab. Die Löschfrist ist eine Compliance-Zusage – bitte nicht liegen lassen.',
  greeting: 'Hallo,',
  signOff: `Viele Grüße<br />Ihr ${APP_NAME}-Team`,
};

/** Platform-admin alert for a nightly purge that skipped businesses. Names and reasons are
 *  escaped: the reason is an error message from another system and the name is user-typed. */
export function buildPurgeAlert(job: IErasurePurgeAlertEmailJob): ErasureNoticeContent {
  const s = job.locale === 'de' ? PURGE_ALERT_DE : PURGE_ALERT_EN;
  const rows = job.skipped.map(item =>
    p(s.row(escapeHtml(item.name), item.daysOverdue, escapeHtml(item.reason)))
  );
  return {
    subject: s.subject(job.skipped.length),
    title: s.title,
    body: [p(s.greeting), p(s.intro(job.skipped.length)), ...rows, p(s.outro), p(s.signOff)].join(
      ''
    ),
  };
}

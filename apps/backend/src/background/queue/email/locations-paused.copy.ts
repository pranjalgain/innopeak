import type { ILocationsPausedEmailJob } from '@bg/interfaces/job.interface';
import { escapeHtml } from '@email-queue/erasure-notice.copy';

export interface LocationsPausedContent {
  subject: string;
  title: string;
  /** Trusted HTML — every interpolated value is escaped on the way in. */
  body: string;
  actionText: string;
  actionUrl: string;
}

interface Strings {
  greeting: (name: string) => string;
  fallbackName: string;
  subject: (business: string) => string;
  /** When the business name is unknown: never "Some locations of  are paused". */
  subjectUnnamed: string;
  /** Stands in for the business name at the start of `intro`. */
  yourBusiness: string;
  title: string;
  intro: (business: string, max: number) => string;
  paused: string;
  kept: string;
  effect: string;
  choose: string;
  action: string;
  signOff: string;
}

const EN: Strings = {
  greeting: name => `Hi ${name},`,
  fallbackName: 'there',
  subject: business => `Some locations of ${business} are paused`,
  subjectUnnamed: 'Some of your locations are paused',
  yourBusiness: 'Your business',
  title: 'Some locations are paused',
  intro: (business, max) =>
    `${business} is on the Free plan, which allows ${max} active ${max === 1 ? 'location' : 'locations'}, so we paused the others.`,
  paused: 'Paused:',
  kept: 'Still active:',
  effect:
    'Paused locations stay connected, but their reviews are not synced, drafted or replied to until they are active again.',
  choose:
    'You can choose which location stays active in Settings → Billing, or upgrade to Paid to resume them all.',
  action: 'Open billing settings',
  signOff: 'Best regards',
};

const DE: Strings = {
  greeting: name => `Hallo ${name},`,
  fallbackName: 'zusammen',
  subject: business => `Einige Standorte von ${business} wurden pausiert`,
  subjectUnnamed: 'Einige Ihrer Standorte wurden pausiert',
  yourBusiness: 'Ihr Unternehmen',
  title: 'Einige Standorte wurden pausiert',
  intro: (business, max) =>
    `${business} nutzt den Free-Tarif, der ${max} aktive${max === 1 ? 'n Standort' : ' Standorte'} erlaubt, daher haben wir die übrigen pausiert.`,
  paused: 'Pausiert:',
  kept: 'Weiterhin aktiv:',
  effect:
    'Pausierte Standorte bleiben verbunden, ihre Bewertungen werden aber erst wieder synchronisiert, entworfen und beantwortet, wenn sie aktiv sind.',
  choose:
    'In Einstellungen → Abrechnung wählen Sie, welcher Standort aktiv bleibt, oder Sie wechseln zu Paid, um alle fortzusetzen.',
  action: 'Abrechnungseinstellungen öffnen',
  signOff: 'Viele Grüße',
};

const p = (text: string): string => `<p>${text}</p>`;
const list = (names: string[]): string =>
  `<ul>${names.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`;

/** A subject must be one line whatever the business was named. */
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Rendered from the payload alone, in the recipient's language; names are user- or Google-supplied, so escaped. */
export function buildLocationsPausedNotice(job: ILocationsPausedEmailJob): LocationsPausedContent {
  const s = job.locale === 'de' ? DE : EN;
  // Blank counts as missing: an SSO account may have an empty name, and the tenant row may not have been readable.
  const businessName = oneLine(job.businessName);
  const recipientName = oneLine(job.customerName ?? '');
  const business = businessName ? escapeHtml(businessName) : s.yourBusiness;

  return {
    subject: businessName ? s.subject(businessName) : s.subjectUnnamed,
    title: s.title,
    body: [
      p(s.greeting(escapeHtml(recipientName || s.fallbackName))),
      p(s.intro(business, job.maxLocations)),
      p(s.paused),
      list(job.pausedLocationNames),
      ...(job.keptLocationNames.length > 0 ? [p(s.kept), list(job.keptLocationNames)] : []),
      p(s.effect),
      p(s.choose),
      p(s.signOff),
    ].join(''),
    actionText: s.action,
    actionUrl: job.settingsUrl,
  };
}

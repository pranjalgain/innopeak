import type { MessageCatalog } from './message-catalog.type';

/**
 * German translations. Typed against `MessageCatalog` (not `typeof messagesEn`) so a missing or
 * extra key here is a compile error rather than a silent gap.
 *
 * **Drafted, not reviewed.** This is a professional-register best-effort translation, not a
 * native-speaker/legal review — per the multilingual design doc, that review is still required
 * before anything security- or legally-sensitive here ships to real users. Two properties a
 * reviewer must preserve, not just the wording:
 *
 *  1. **Anti-enumeration pairs must stay identical.** `SIGNUP_OTP_SENT` and `LOGIN_OTP_SENT` are
 *     deliberately the same text in English so a caller cannot tell a signup attempt from a login
 *     attempt from the response alone — a German synonym for one but not the other would
 *     reintroduce that oracle. `message-registry.spec.ts` asserts this pair stays equal; a
 *     reviewer changing the wording must keep both branches identical.
 *  2. **Deliberately-vague messages must stay vague.** `INVALID_CREDENTIALS`,
 *     `INVALID_OR_EXPIRED_OTP`, `RESEND_OTP_ACK`, and `TENANT_ONLY` (which never names the
 *     caller's actual token type) are worded to avoid confirming which specific case applies —
 *     see the English file's comments at each key for the exact scenario each one is hiding.
 */
export const messagesDe: MessageCatalog = {
  AUTH: {
    SIGNUP_OTP_SENT: (email: string): string => `Bestätigungscode gesendet an ${email}`,
    LOGIN_OTP_SENT: (email: string): string => `Bestätigungscode gesendet an ${email}`,
    RESEND_OTP_ACK: 'Falls für dieses Konto eine Bestätigung aussteht, wurde ein Code gesendet.',
    EMAIL_VERIFIED: 'E-Mail-Adresse bestätigt.',
    EMAIL_ALREADY_REGISTERED: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
    INVALID_OR_EXPIRED_OTP: 'Ungültiger oder abgelaufener Bestätigungscode.',
    TOO_MANY_OTP_ATTEMPTS:
      'Zu viele Bestätigungsversuche. Fordern Sie einen neuen Code an und versuchen Sie es in Kürze erneut.',
    INVALID_CREDENTIALS: 'Ungültige E-Mail-Adresse oder ungültiges Passwort.',
    ACCOUNT_DISABLED: 'Dieses Konto wurde deaktiviert.',
    TENANT_SUSPENDED: 'Dieses Konto ist derzeit gesperrt.',
    INVALID_REFRESH_TOKEN: 'Ungültiges oder abgelaufenes Refresh-Token.',
    INVALID_ACCESS_TOKEN: 'Ungültiges oder abgelaufenes Zugriffstoken.',
    LOGGED_OUT: 'Abgemeldet.',
    INVALID_CURRENT_PASSWORD: 'Das aktuelle Passwort ist falsch.',
    NO_PASSWORD_SET:
      'Für dieses Konto ist kein Passwort festgelegt. Melden Sie sich mit dem Identitätsanbieter an, mit dem es erstellt wurde.',
    PASSWORD_ALREADY_SET:
      'Für dieses Konto ist bereits ein Passwort festgelegt. Verwenden Sie stattdessen die Funktion zum Ändern des Passworts.',
    PASSWORD_CHANGED: 'Passwort geändert. Andere Sitzungen werden abgemeldet.',
    PASSWORD_SET: 'Passwort festgelegt. Sie können sich jetzt auch mit einem Passwort anmelden.',
    LOCALE_UPDATED: 'Spracheinstellung aktualisiert.',
    TENANT_ONLY: 'Diese Aktion steht nur Mandantenbenutzern zur Verfügung.',
    GOOGLE_NOT_CONFIGURED:
      'Die Google-Anmeldung ist auf diesem Server nicht konfiguriert. Wenden Sie sich an den Support oder verwenden Sie E-Mail-Adresse und Passwort.',
    GOOGLE_PENDING_SIGNUP_EXPIRED:
      'Diese Registrierung ist abgelaufen. Beginnen Sie erneut mit „Mit Google fortfahren“.',
    TENANT_CONTEXT_REQUIRED: 'Dieser Endpunkt ist für diesen Kontotyp nicht verfügbar.',
  },
  CONNECTIONS: {
    CONNECTION_NOT_FOUND:
      'Für dieses Konto wurde keine Google Business-Profil-Verbindung gefunden.',
    LOCATION_NOT_FOUND: 'Standort nicht gefunden.',
    EXTERNAL_LOCATION_NOT_FOUND:
      'Dieser Standort ist für das verbundene Google-Konto nicht sichtbar. Verbinden Sie sich erneut und versuchen Sie es noch einmal.',
    CONNECTION_NEEDS_REAUTH:
      'Die Google-Verbindung ist abgelaufen. Verbinden Sie Ihr Google Business-Profil erneut, um fortzufahren.',
    LOCATION_LIMIT_REACHED: 'Für dieses Konto ist bereits ein aktiver Standort vorhanden.',
    BACKFILL_ENQUEUE_FAILED:
      'Standort verbunden, aber der Rezensionsimport konnte nicht gestartet werden. Bitte bestätigen Sie diesen Standort erneut.',
    PROVIDER_UNAVAILABLE:
      'Google Business-Profil ist derzeit nicht verfügbar. Bitte versuchen Sie es erneut.',
    PROVIDER_NOT_CONFIGURED:
      'Google Business-Profil ist auf diesem Server nicht konfiguriert. Wenden Sie sich an den Support.',
    DISCONNECTED: 'Google Business-Profil getrennt.',
    LOCATION_CONFIRMED: 'Standort verbunden. Ihr Rezensionsverlauf wird importiert.',
  },
  DASHBOARD: {
    TENANT_ONLY: 'Dashboard-Analysen stehen nur Mandantenbenutzern zur Verfügung.',
  },
  REVIEWS: {
    REVIEW_NOT_FOUND: 'Rezension nicht gefunden.',
    TENANT_ONLY: 'Rezensionen stehen nur Mandantenbenutzern zur Verfügung.',
  },
  PROMPTS: {
    LISTED: 'Prompts erfolgreich abgerufen',
    VERSION_CREATED: 'Prompt-Version erfolgreich erstellt',
    TONE_UPDATED: 'Prompt-Tonalität erfolgreich aktualisiert',
    NOT_FOUND: 'Prompt nicht gefunden',
    TEMPLATE_UNCHANGED: 'Vorlage ist identisch mit der aktuellen Version',
    VERSION_CONFLICT:
      'Eine andere Version wurde gleichzeitig gespeichert — versuchen Sie es nach dem Neuladen erneut',
    UNKNOWN_VARIABLE: (names: readonly string[]): string =>
      `Unbekannte(r) Prompt-Platzhalter: ${names.join(', ')}`,
    MISSING_VARIABLE: (names: readonly string[]): string =>
      `Fehlende(r) erforderliche(r) Prompt-Platzhalter: ${names.join(', ')}`,
    TENANT_ONLY: 'Prompts stehen nur Mandantenbenutzern zur Verfügung.',
  },
  SETTINGS: {
    BLOCKLIST_LISTED: 'Sperrlisteneinträge erfolgreich abgerufen',
    BLOCKLIST_TERM_CREATED: 'Sperrlisteneintrag hinzugefügt',
    BLOCKLIST_TERM_REMOVED: 'Sperrlisteneintrag entfernt',
    BLOCKLIST_TERM_EXISTS: 'Dieser Begriff steht bereits auf der Sperrliste',
    BLOCKLIST_TERM_NOT_FOUND: 'Sperrlisteneintrag nicht gefunden',
    TENANT_ONLY: 'Einstellungen stehen nur Mandantenbenutzern zur Verfügung.',
    RETRIEVED: 'Einstellungen erfolgreich abgerufen',
    UPDATED: 'Einstellungen aktualisiert',
    TENANT_SETTINGS_MISSING: 'Für dieses Konto wurden keine Mandanteneinstellungen eingerichtet',
  },
  COMMON: {
    SUCCESS: 'Erfolgreich',
    REQUEST_SUCCESSFUL: 'Anfrage erfolgreich',
  },
};

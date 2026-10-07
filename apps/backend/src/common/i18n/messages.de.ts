import type { MessageCatalog } from './message-catalog.type';

/**
 * Drafted, not native-speaker/legal reviewed. A reviewer must preserve two properties:
 * 1. `SIGNUP_OTP_SENT` and `LOGIN_OTP_SENT` stay identical (enforced in message-registry.spec.ts),
 *    so a response can't distinguish signup from login.
 * 2. Deliberately vague messages (`INVALID_CREDENTIALS`, `INVALID_OR_EXPIRED_OTP`, `RESEND_OTP_ACK`,
 *    `TENANT_ONLY`) stay vague; see the English file's comment at each key.
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
    SET_PASSWORD_OTP_ACK: 'Bestätigungscode gesendet. Prüfen Sie Ihre E-Mails, um fortzufahren.',
    BUSINESS_NAME_MISMATCH: 'Der eingegebene Unternehmensname stimmt nicht überein.',
    PASSWORD_REQUIRED_TO_DELETE: 'Bestätigen Sie mit Ihrem Passwort statt mit einem Code.',
    DELETE_ACCOUNT_OTP_ACK: 'Bestätigungscode gesendet. Prüfen Sie Ihre E-Mails, um fortzufahren.',
    ACCOUNT_DELETION_NOT_POSSIBLE:
      'Die Löschung dieses Unternehmens kann derzeit nicht vorgemerkt werden.',
    ACCOUNT_DELETION_SCHEDULED: 'Löschung vorgemerkt. Sie wurden abgemeldet.',
    ACCOUNT_SCHEDULED_FOR_DELETION: (date: string): string =>
      `Dieses Unternehmen ist zur Löschung am ${date} vorgemerkt. Bis dahin können Sie es wiederherstellen.`,
    ACCOUNT_RESTORED: 'Ihr Unternehmen wurde wiederhergestellt. Sie können sich jetzt anmelden.',
    LOCALE_UPDATED: 'Spracheinstellung aktualisiert.',
    AVATAR_UPDATED: 'Avatar aktualisiert.',
    TENANT_ONLY: 'Diese Aktion steht nur Mandantenbenutzern zur Verfügung.',
    GOOGLE_NOT_CONFIGURED:
      'Die Google-Anmeldung ist auf diesem Server nicht konfiguriert. Wenden Sie sich an den Support oder verwenden Sie E-Mail-Adresse und Passwort.',
    GOOGLE_PENDING_SIGNUP_EXPIRED:
      'Diese Registrierung ist abgelaufen. Beginnen Sie erneut mit „Mit Google fortfahren“.',
    TENANT_CONTEXT_REQUIRED: 'Dieser Endpunkt ist für diesen Kontotyp nicht verfügbar.',
    INVALID_OR_EXPIRED_INVITE: 'Dieser Einladungslink ist ungültig oder abgelaufen.',
    INVITE_ACCEPTED: 'Einladung angenommen. Sie sind angemeldet.',
    FAILED_TO_CREATE_TENANT: 'Mandant konnte nicht erstellt werden',
    FAILED_TO_CREATE_USER: 'Benutzer konnte nicht erstellt werden',
    FAILED_TO_CREATE_INVITED_MEMBER: 'Eingeladenes Teammitglied konnte nicht erstellt werden',
  },
  MEDIA: {
    UPLOAD_NOT_VERIFIED: 'Das hochgeladene Bild konnte nicht verifiziert werden.',
    UNSUPPORTED_FORMAT:
      'Dieses Bildformat wird nicht unterstützt. Bitte laden Sie eine JPG-, PNG-, WEBP-, GIF-, AVIF-, HEIC- oder BMP-Datei hoch.',
    FILE_TOO_LARGE: 'Dieses Bild ist zu groß. Bitte laden Sie eine Datei unter 10 MB hoch.',
    FAILED_TO_PERSIST_AVATAR: 'Avatar konnte nicht gespeichert werden',
  },
  NOTIFICATIONS: {
    LISTED: 'Benachrichtigungen erfolgreich abgerufen',
    NOT_FOUND: 'Benachrichtigung nicht gefunden.',
    MARKED_READ: 'Benachrichtigung als gelesen markiert',
    MARKED_ALL_READ: 'Alle Benachrichtigungen als gelesen markiert',
  },
  CONNECTIONS: {
    CONNECTION_NOT_FOUND:
      'Für dieses Konto wurde keine Google Business-Profil-Verbindung gefunden.',
    LOCATION_NOT_FOUND: 'Standort nicht gefunden.',
    EXTERNAL_LOCATION_NOT_FOUND:
      'Dieser Standort ist für das verbundene Google-Konto nicht sichtbar. Verbinden Sie sich erneut und versuchen Sie es noch einmal.',
    CONNECTION_NEEDS_REAUTH:
      'Die Google-Verbindung ist abgelaufen. Verbinden Sie Ihr Google Business-Profil erneut, um fortzufahren.',
    LOCATION_LIMIT_REACHED:
      'Sie haben das Standortlimit Ihres Tarifs erreicht. Führen Sie ein Upgrade durch, um weitere hinzuzufügen.',
    BACKFILL_ENQUEUE_FAILED:
      'Standort verbunden, aber der Rezensionsimport konnte nicht gestartet werden. Bitte bestätigen Sie diesen Standort erneut.',
    PROVIDER_UNAVAILABLE:
      'Google Business-Profil ist derzeit nicht verfügbar. Bitte versuchen Sie es erneut.',
    PROVIDER_NOT_CONFIGURED:
      'Google Business-Profil ist auf diesem Server nicht konfiguriert. Wenden Sie sich an den Support.',
    DISCONNECTED: 'Google Business-Profil getrennt.',
    LOCATION_CONFIRMED: 'Standort verbunden. Ihr Rezensionsverlauf wird importiert.',
    LOCATION_INACTIVE: 'Dieser Standort ist getrennt und kann nicht ausgewählt werden.',
    ACTIVE_LOCATION_UPDATED: 'Aktiver Standort aktualisiert.',
    FAILED_TO_UPSERT_CONNECTION:
      'Verbindung zum Rezensionsanbieter konnte nicht gespeichert werden',
    FAILED_TO_UPSERT_LOCATION: 'Standort konnte nicht gespeichert werden',
  },
  DASHBOARD: {
    TENANT_ONLY: 'Dashboard-Analysen stehen nur Mandantenbenutzern zur Verfügung.',
  },
  REVIEWS: {
    REVIEW_NOT_FOUND: 'Rezension nicht gefunden.',
    TENANT_ONLY: 'Rezensionen stehen nur Mandantenbenutzern zur Verfügung.',
    FAILED_TO_ACQUIRE_SYNC_RUN: 'Synchronisierungslauf konnte nicht gestartet werden',
    FAILED_TO_UPSERT_REVIEW: 'Rezension konnte nicht gespeichert werden',
    GENERATED_RESPONSE_INSERT_FAILED: (reviewId: string): string =>
      `Generierte Antwort für Rezension ${reviewId} konnte nicht gespeichert werden`,
    RESPONSE_NOT_FOUND: 'Antwortentwurf nicht gefunden.',
    RESPONSE_NOT_ACTIONABLE:
      'Über diese Antwort wurde bereits entschieden — sie kann nicht mehr geändert werden.',
    RESPONSE_ALREADY_LIVE:
      'Für diese Rezension existiert bereits eine genehmigte oder veröffentlichte Antwort.',
    RESPONSE_APPROVED: 'Antwort erfolgreich genehmigt',
    RESPONSE_REJECTED: 'Antwort erfolgreich abgelehnt',
    RESPONSE_NOT_RETRYABLE:
      'Nur eine Antwort, deren Veröffentlichung fehlgeschlagen ist, kann erneut versucht werden.',
    RESPONSE_NOT_POSTABLE:
      'Nur eine genehmigte, noch nicht veröffentlichte Antwort kann veröffentlicht werden.',
    REVIEW_ALREADY_HAS_LIVE_REPLY:
      'Für diese Rezension existiert bereits eine genehmigte oder veröffentlichte Antwort.',
    REVIEW_ALREADY_DISMISSED: 'Diese Rezension wurde verworfen und kann nicht beantwortet werden.',
    REVIEW_REMOVED_UPSTREAM:
      'Diese Rezension wurde bei Google entfernt und kann nicht beantwortet werden.',
    POST_QUEUE_UNAVAILABLE:
      'Die Antwort konnte gerade nicht zur Veröffentlichung eingereiht werden. Bitte erneut versuchen.',
    POST_FAILED_REVIEW_REMOVED:
      'Diese Rezension wurde bei Google entfernt, daher konnte die Antwort nicht veröffentlicht werden.',
    MANUAL_REPLY_INSERT_FAILED: (reviewId: string): string =>
      `Manuelle Antwort für Rezension ${reviewId} konnte nicht gespeichert werden`,
    MANUAL_REPLY_CREATED: 'Antwort erfolgreich erstellt',
    RESPONSE_POST_QUEUED: 'Antwort zur Veröffentlichung bei Google eingereiht',
    RESPONSE_RETRY_QUEUED: 'Antwort zur erneuten Veröffentlichung bei Google eingereiht',
    POST_STATUS_RETRIEVED: 'Veröffentlichungsstatus erfolgreich abgerufen',
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
    STATS_RETRIEVED: 'Prompt-Versionsstatistik erfolgreich abgerufen',
    VERSION_NOT_FOUND: 'Prompt-Version nicht gefunden',
    STATS_BATCH_RETRIEVED: 'Prompt-Versionsstatistik erfolgreich abgerufen',
  },
  AI: {
    TENANT_ONLY: 'Die KI-Antwortgenerierung steht nur Mandantenbenutzern zur Verfügung.',
    DRY_RUN_GENERATED: 'KI-Antwort erfolgreich generiert',
    PROMPT_NOT_CONFIGURED: 'Für diese Kategorie ist noch kein Prompt konfiguriert.',
    PROVIDER_NOT_CONFIGURED:
      'Der KI-Anbieter ist nicht konfiguriert. Setzen Sie OPENROUTER_API_KEY und OPENROUTER_MODEL.',
    AZURE_PROVIDER_NOT_CONFIGURED:
      'Der Azure-OpenAI-Anbieter ist nicht konfiguriert. Setzen Sie AZURE_OPENAI_ENDPOINT, ' +
      'AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT und AZURE_OPENAI_API_VERSION.',
    AZURE_REGION_INVALID:
      'AZURE_OPENAI_REGION muss „westeurope" sein — eine DSGVO-Anforderung für diese Bereitstellung.',
    GENERATION_FAILED: 'KI-Antwort konnte nicht generiert werden. Bitte versuchen Sie es erneut.',
  },
  BILLING: {
    PLANS_RETRIEVED: 'Tarife erfolgreich abgerufen',
    SUBSCRIPTION_RETRIEVED: 'Abonnement erfolgreich abgerufen',
    CHECKOUT_SESSION_CREATED: 'Checkout-Sitzung erstellt',
    PORTAL_SESSION_CREATED: 'Abrechnungsportal-Sitzung erstellt',
    ACTIVE_LOCATION_UPDATED: 'Aktiver Standort aktualisiert',
    TENANT_ONLY: 'Abrechnung steht nur Mandantenbenutzern zur Verfügung.',
    NOT_ENABLED: 'Die Abrechnung ist derzeit für neue Upgrades nicht verfügbar.',
    PLAN_NOT_FOUND: 'Tarif nicht gefunden',
    SUBSCRIPTION_NOT_FOUND: 'Abonnement nicht gefunden',
    ALREADY_SUBSCRIBED: 'Sie nutzen bereits den kostenpflichtigen Tarif.',
    LOCATION_LIMIT_REACHED:
      'Sie haben das Standortlimit Ihres Tarifs erreicht. Führen Sie ein Upgrade durch, um weitere hinzuzufügen.',
    TEAM_MEMBER_LIMIT_REACHED:
      'Sie haben das Teammitgliederlimit Ihres Tarifs erreicht. Führen Sie ein Upgrade durch, um weitere einzuladen.',
    CUSTOM_PROMPTS_NOT_ON_PLAN:
      'Benutzerdefinierte Prompt-Vorlagen sind in Ihrem aktuellen Tarif nicht verfügbar.',
    AI_DRAFT_LIMIT_REACHED: 'Sie haben das monatliche KI-Entwurfslimit Ihres Tarifs erreicht.',
    STRIPE_WEBHOOK_SIGNATURE_INVALID: 'Ungültige Stripe-Webhook-Signatur',
    LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION:
      'Dieser Standort kann nicht aktiviert werden — er gehört möglicherweise nicht zu Ihrem Unternehmen oder ist getrennt.',
    DUMMY_PROVIDER_NOT_ACTIVE: 'Nicht gefunden',
    CHECKOUT_COMPLETED: 'Bezahlvorgang erfolgreich abgeschlossen',
    SUBSCRIPTION_CANCELED: 'Abonnement wird zum Ende des aktuellen Abrechnungszeitraums gekündigt',
    FAILED_TO_CREATE_SUBSCRIPTION: 'Mandantenabonnement konnte nicht erstellt werden',
    FREE_PLAN_NOT_SEEDED: 'Der kostenlose Tarif ist nicht angelegt',
    PAID_PLAN_NOT_SEEDED: 'Der kostenpflichtige Tarif ist nicht angelegt',
    RECEIPTS_RETRIEVED: 'Belege erfolgreich abgerufen',
    RECEIPT_NOT_FOUND: 'Beleg nicht gefunden',
    BILLING_PROFILE_RETRIEVED: 'Abrechnungsprofil erfolgreich abgerufen',
    BILLING_PROFILE_UPDATED: 'Abrechnungsprofil aktualisiert',
    SETUP_INTENT_CREATED: 'Karteneinrichtung gestartet',
    PAYMENT_METHOD_UPDATED: 'Zahlungsmethode aktualisiert',
    STRIPE_ONLY_FEATURE: 'Dies ist in dieser Umgebung nicht verfügbar.',
    STRIPE_WEBHOOK_TENANT_NOT_FOUND: 'Kein passender Mandant für dieses Stripe-Ereignis gefunden',
    CHECKOUT_SESSION_TENANT_MISMATCH: 'Checkout-Sitzung nicht gefunden',
    PAYMENT_METHOD_NOT_USABLE:
      'Diese Zahlungsmethode kann für dieses Konto nicht verwendet werden. Fügen Sie die Karte erneut hinzu.',
    CHECKOUT_RECONCILED: 'Abrechnungsstatus aktualisiert',
  },
  SETTINGS: {
    BLOCKLIST_LISTED: 'Sperrlisteneinträge erfolgreich abgerufen',
    BLOCKLIST_TERM_CREATED: 'Sperrlisteneintrag hinzugefügt',
    BLOCKLIST_TERM_REMOVED: 'Sperrlisteneintrag entfernt',
    BLOCKLIST_TERM_EXISTS: 'Dieser Begriff steht bereits auf der Sperrliste',
    BLOCKLIST_LIMIT_REACHED:
      'Sie haben das Limit von 100 Sperrlisten-Begriffen erreicht. Entfernen Sie einen, um einen weiteren hinzuzufügen.',
    BLOCKLIST_TERM_NOT_FOUND: 'Sperrlisteneintrag nicht gefunden',
    TENANT_ONLY: 'Einstellungen stehen nur Mandantenbenutzern zur Verfügung.',
    RETRIEVED: 'Einstellungen erfolgreich abgerufen',
    UPDATED: 'Einstellungen aktualisiert',
    TENANT_SETTINGS_MISSING: 'Für dieses Konto wurden keine Mandanteneinstellungen eingerichtet',
    TENANT_SETTINGS_ROW_MISSING: (tenantId: string): string =>
      `Keine Mandanteneinstellungen für Mandant ${tenantId} gefunden`,
    PLATFORM_CONFIG_MISSING: 'Die Plattformeinstellungen sind nicht konfiguriert.',
    MEMBER_INVITE_SENT: 'Einladung gesendet.',
    MEMBER_INVITE_REVOKED: 'Einladung widerrufen.',
    MEMBER_EMAIL_ALREADY_INVITED:
      'Für diese E-Mail-Adresse besteht bereits eine ausstehende Einladung.',
    MEMBER_NOT_FOUND: 'Teammitglied nicht gefunden.',
    MEMBER_INVITE_NOT_REVOCABLE:
      'Diese Einladung wurde bereits angenommen oder ist nicht mehr ausstehend.',
    MEMBER_INVITES_DISABLED:
      'Das Einladen von Teammitgliedern ist für diese Plattform deaktiviert.',
    MEMBER_REMOVAL_REQUESTED: (days: number): string =>
      `Entfernung angefordert. Dieses Mitglied verliert sofort den Zugriff, und seine Daten werden in ${days} Tagen endgültig gelöscht, sofern Sie nicht vorher abbrechen.`,
    MEMBER_REMOVAL_CANCELLED: 'Entfernung abgebrochen — dieses Mitglied behält seinen Zugriff.',
    MEMBER_REMOVAL_NOT_PENDING: 'Für dieses Mitglied liegt keine ausstehende Entfernung vor.',
    CANNOT_REMOVE_LAST_OWNER: 'Mindestens ein Inhaber muss für dieses Konto bestehen bleiben.',
    CANNOT_REMOVE_SELF: 'Sie können Ihr eigenes Konto auf diesem Weg nicht entfernen.',
    NOTIFICATION_RECIPIENTS_LISTED: 'Benachrichtigungsempfänger erfolgreich abgerufen',
    NOTIFICATION_RECIPIENT_UPDATED: 'Benachrichtigungsempfänger aktualisiert',
    NOTIFICATION_RECIPIENT_NOT_FOUND: 'Benachrichtigungsempfänger nicht gefunden',
    NOTIFICATION_RECIPIENT_NO_FIELDS:
      'Geben Sie einen Kanal oder einen Aktivitätsstatus zur Aktualisierung an.',
  },
  ADMIN: {
    ADMIN_ONLY: 'Nur ein Plattform-Administrator kann diese Aktion ausführen.',
    USER_NOT_FOUND: 'Benutzer nicht gefunden.',
    USER_STATUS_UPDATED: 'Benutzerstatus aktualisiert.',
    BUSINESS_NOT_FOUND: 'Unternehmen nicht gefunden.',
    POST_ERASURE_CHARGE_NOT_FOUND: 'Diese Abbuchung wurde nicht gefunden oder bereits bearbeitet.',
    POST_ERASURE_CHARGE_RESOLVED: 'Als bearbeitet markiert.',
    BUSINESS_STATUS_UPDATED: 'Unternehmensstatus aktualisiert.',
    BUSINESS_ERASURE_REQUESTED: (days: number): string =>
      `Löschung angefordert. Jeder Benutzer dieses Unternehmens verliert sofort den Zugriff, und die Daten werden in ${days} Tagen endgültig gelöscht, sofern Sie nicht vorher abbrechen.`,
    BUSINESS_ERASURE_CANCELLED: 'Löschung abgebrochen — dieses Unternehmen ist wieder aktiv.',
    BUSINESS_ERASURE_PENDING:
      'Für dieses Unternehmen liegt eine ausstehende Löschanfrage vor. Brechen Sie diese ab, bevor Sie den Status direkt ändern.',
    USER_REMOVAL_PENDING:
      'Für diesen Benutzer liegt eine ausstehende Entfernungsanfrage vor. Brechen Sie diese ab, bevor Sie den Status direkt ändern.',
    AVATAR_UPDATED: 'Avatar aktualisiert.',
    PASSWORD_CHANGED: 'Passwort geändert.',
    INVITE_SENT: 'Einladung gesendet.',
    INVITE_REVOKED: 'Einladung widerrufen.',
    INVITE_NOT_FOUND: 'Einladung nicht gefunden.',
    INVITE_NOT_REVOCABLE:
      'Diese Einladung wurde bereits angenommen oder ist nicht mehr ausstehend.',
    EMAIL_ALREADY_INVITED:
      'Diese E-Mail-Adresse ist bereits ein Plattform-Administrator oder hat eine ausstehende Einladung.',
    PLATFORM_SETTINGS_UPDATED: 'Plattformeinstellungen aktualisiert.',
    PLATFORM_SETTINGS_NO_METHOD_ENABLED:
      'Mindestens eine Anmeldemethode (SSO, E-Mail/Passwort oder Google) muss aktiviert bleiben.',
    CANNOT_DISABLE_SOCIAL_LOGIN_GOOGLE_ONLY_ADMIN: (count: number): string => {
      if (count === 1) {
        return 'Google ist die einzige Anmeldemöglichkeit für einen Ihrer Plattform-Administratoren. Ein Deaktivieren würde ihn aussperren. Deaktivieren Sie zuerst dieses Administratorkonto, falls dies beabsichtigt ist.';
      }
      return `Google ist die einzige Anmeldemöglichkeit für ${count} Ihrer Plattform-Administratoren. Ein Deaktivieren würde sie aussperren. Deaktivieren Sie zuerst diese Administratorkonten, falls dies beabsichtigt ist.`;
    },
    ADMIN_NOT_FOUND: 'Plattform-Administrator nicht gefunden.',
    CANNOT_DISABLE_SELF: 'Sie können Ihr eigenes Administratorkonto nicht deaktivieren.',
    CANNOT_DISABLE_LAST_ADMIN: 'Mindestens ein Plattform-Administrator muss aktiv bleiben.',
    CANNOT_DISABLE_ROOT_ADMIN:
      'Der ursprüngliche Plattform-Administrator kann nicht deaktiviert werden.',
    CANNOT_DISABLE_INVITED:
      'Dieser Administrator hat seine Einladung noch nicht angenommen — widerrufen Sie stattdessen die Einladung.',
    ADMIN_DISABLED: 'Administrator deaktiviert.',
    ADMIN_ENABLED: 'Administrator aktiviert.',
    FAILED_TO_CREATE_INVITED_PLATFORM_ADMIN:
      'Eingeladener Plattform-Administrator konnte nicht erstellt werden',
  },
  COMMON: {
    SUCCESS: 'Erfolgreich',
    REQUEST_SUCCESSFUL: 'Anfrage erfolgreich',
    INTERNAL_ERROR: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es später erneut.',
  },
};

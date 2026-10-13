import type { Locale } from './locale';
import { messagesDe } from './messages.de';
import { messagesEn } from './messages.en';

// DTO validators carry their English sentence directly (`@IsEmail({}, { message: 'Enter a valid email address.' })`):
// class-validator messages are plain strings, never `MESSAGES` tags, because the error handler joins and re-punctuates
// them before they reach the filter. The sentence is therefore the lookup key: it is matched to the `VALIDATION`
// catalog entry with that English text, and the same entry in the caller's language is used instead.
const KEY_BY_ENGLISH_TEXT = new Map(
  Object.entries(messagesEn.VALIDATION).map(([key, text]) => [
    text,
    key as keyof typeof messagesEn.VALIDATION,
  ])
);

// The rest are technical messages that start with the API field they are about, from class-validator's own defaults
// (`page must not be less than 1`) and from DTOs that spell the rule out (`newPassword must be between 8 and 128
// characters`). They are matched by shape, and the field name is kept as it is: it is the identifier the caller sent.
// Each rule is `[English shape, German template]`; `$1` is the field, `$2`/`$3` the captured numbers or list.
const FIELD = '(\\S+)';
const END = '\\.?$';
const PATTERN_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(`^property ${FIELD} should not exist${END}`), 'Die Eigenschaft $1 ist nicht erlaubt'],
  [new RegExp(`^${FIELD} must be a string${END}`), '$1 muss eine Zeichenfolge sein'],
  [new RegExp(`^${FIELD} must be an integer number${END}`), '$1 muss eine ganze Zahl sein'],
  [
    new RegExp(`^${FIELD} must be a number conforming to the specified constraints${END}`),
    '$1 muss eine Zahl sein',
  ],
  [
    new RegExp(`^${FIELD} must be a boolean value${END}`),
    '$1 muss ein Wahrheitswert (true/false) sein',
  ],
  [new RegExp(`^${FIELD} must be an email${END}`), '$1 muss eine gültige E-Mail-Adresse sein'],
  [new RegExp(`^${FIELD} must be a UUID${END}`), '$1 muss eine UUID sein'],
  [new RegExp(`^${FIELD} must be an array${END}`), '$1 muss eine Liste sein'],
  [
    new RegExp(`^${FIELD} must be a valid ISO 8601 date string${END}`),
    '$1 muss ein gültiges Datum im ISO-8601-Format sein',
  ],
  [new RegExp(`^${FIELD} (?:should|must) not be empty${END}`), '$1 darf nicht leer sein'],
  [new RegExp(`^${FIELD} is required${END}`), '$1 ist erforderlich'],
  [
    new RegExp(`^${FIELD} must be longer than or equal to (\\d+) characters${END}`),
    '$1 muss mindestens $2 Zeichen lang sein',
  ],
  [
    new RegExp(`^${FIELD} must be shorter than or equal to (\\d+) characters${END}`),
    '$1 darf höchstens $2 Zeichen lang sein',
  ],
  [
    new RegExp(`^${FIELD} must be between (\\d+) and (\\d+) characters${END}`),
    '$1 muss zwischen $2 und $3 Zeichen lang sein',
  ],
  [
    new RegExp(`^${FIELD} must be at most (\\d+) characters${END}`),
    '$1 darf höchstens $2 Zeichen lang sein',
  ],
  [
    new RegExp(`^${FIELD} must not be less than (-?\\d+)${END}`),
    '$1 darf nicht kleiner als $2 sein',
  ],
  [
    new RegExp(`^${FIELD} must not be greater than (-?\\d+)${END}`),
    '$1 darf nicht größer als $2 sein',
  ],
  [
    new RegExp(`^${FIELD} must contain at least (\\d+) elements${END}`),
    '$1 muss mindestens $2 Elemente enthalten',
  ],
  [
    new RegExp(`^${FIELD} must contain no more than (\\d+) elements${END}`),
    '$1 darf höchstens $2 Elemente enthalten',
  ],
  [
    new RegExp(`^${FIELD} must contain at most (\\d+) entries${END}`),
    '$1 darf höchstens $2 Einträge enthalten',
  ],
  [
    new RegExp(`^${FIELD} must be one of(?: the following values)?: (.+?)${END}`),
    '$1 muss einer der folgenden Werte sein: $2',
  ],
  [
    new RegExp(
      `^${FIELD} must contain an uppercase letter, a lowercase letter, a digit, and a special character${END}`
    ),
    '$1 muss einen Großbuchstaben, einen Kleinbuchstaben, eine Ziffer und ein Sonderzeichen enthalten',
  ],
  [new RegExp(`^${FIELD} must match .+ regular expression${END}`), '$1 hat ein ungültiges Format'],
  [new RegExp(`^${FIELD} is not a valid session id${END}`), '$1 ist keine gültige Sitzungs-ID'],
  [new RegExp(`^${FIELD} must contain some text${END}`), '$1 muss Text enthalten'],
];

function translateByPattern(message: string): string | undefined {
  for (const [pattern, template] of PATTERN_RULES) {
    const match = pattern.exec(message);
    if (match) {
      return template.replace(/\$(\d)/g, (_, index: string) => match[Number(index)] ?? '');
    }
  }
  return undefined;
}

/**
 * The message in `locale`: a known user-facing sentence from the `VALIDATION` catalog, else a technical message
 * recognised by shape, else the message unchanged (anything unrecognised stays English rather than being guessed at).
 */
export function translateValidationMessage(message: string, locale: Locale): string {
  if (locale === 'en') {
    return message;
  }
  const key = KEY_BY_ENGLISH_TEXT.get(message);
  if (key !== undefined) {
    return messagesDe.VALIDATION[key];
  }
  return translateByPattern(message) ?? message;
}

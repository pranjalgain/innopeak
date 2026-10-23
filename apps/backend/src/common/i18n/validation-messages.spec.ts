import type { LoggerService } from '@logger/logger.service';
import { CreateManualReplyDto } from '@reviews/dto/create-manual-reply.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { messagesDe } from './messages.de';
import { messagesEn } from './messages.en';
import { translateValidationMessage } from './validation-messages';

import { DeleteAccountDto } from '../../api/auth/dto/delete-account.dto';
import { SignupDto } from '../../api/auth/dto/signup.dto';
import { VerifyEmailDto } from '../../api/auth/dto/verify-email.dto';
import { SetDefaultPaymentMethodDto } from '../../api/billing/dto/set-default-payment-method.dto';
import { UpdateBillingProfileDto } from '../../api/billing/dto/update-billing-profile.dto';
import { ErrorHandlerService } from '../services/error-handler.service';

async function messagesFor<T extends object>(
  type: new () => T,
  plain: Record<string, unknown>
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, plain));
  return errors.flatMap(error => Object.values(error.constraints ?? {}));
}

describe('translateValidationMessage — the password byte limit', () => {
  it('is translated, with the field name kept', () => {
    expect(
      translateValidationMessage(
        'password must be at most 72 bytes (an accented character counts as two)',
        'de'
      )
    ).toBe(
      'password darf höchstens 72 Bytes lang sein (ein Zeichen mit Akzent oder Umlaut zählt als zwei)'
    );
  });

  it('is left as written in English', () => {
    expect(
      translateValidationMessage(
        'password must be at most 72 bytes (an accented character counts as two)',
        'en'
      )
    ).toBe('password must be at most 72 bytes (an accented character counts as two)');
  });
});

describe('translateValidationMessage', () => {
  it('leaves English alone', () => {
    expect(translateValidationMessage('Enter a valid email address.', 'en')).toBe(
      'Enter a valid email address.'
    );
  });

  it('translates a known user-facing sentence', () => {
    expect(translateValidationMessage('Enter a valid email address.', 'de')).toBe(
      messagesDe.VALIDATION.EMAIL_INVALID
    );
  });

  it('returns an unrecognised message unchanged rather than guessing', () => {
    expect(translateValidationMessage('something unusual went wrong', 'de')).toBe(
      'something unusual went wrong'
    );
  });

  // Technical messages are matched by shape; the field name stays as the API identifier.
  it.each([
    ['pairs must contain at most 20 entries', 'pairs darf höchstens 20 Einträge enthalten'],
    ['newPassword must be a string', 'newPassword muss eine Zeichenfolge sein'],
    [
      'newPassword must be between 8 and 128 characters',
      'newPassword muss zwischen 8 und 128 Zeichen lang sein',
    ],
    [
      'newPassword must contain an uppercase letter, a lowercase letter, a digit, and a special character',
      'newPassword muss einen Großbuchstaben, einen Kleinbuchstaben, eine Ziffer und ein Sonderzeichen enthalten',
    ],
    ['token is required', 'token ist erforderlich'],
    ['password must be at most 128 characters', 'password darf höchstens 128 Zeichen lang sein'],
    [
      'status must be one of: new, in_review',
      'status muss einer der folgenden Werte sein: new, in_review',
    ],
    ['page must not be less than 1', 'page darf nicht kleiner als 1 sein'],
    ['pageSize must not be greater than 100', 'pageSize darf nicht größer als 100 sein'],
    ['page must be an integer number', 'page muss eine ganze Zahl sein'],
    [
      'search must be shorter than or equal to 200 characters',
      'search darf höchstens 200 Zeichen lang sein',
    ],
    ['property role should not exist', 'Die Eigenschaft role ist nicht erlaubt'],
    ['locationId must be a UUID', 'locationId muss eine UUID sein'],
    ['term should not be empty', 'term darf nicht leer sein'],
    [
      'checkoutSessionId is not a valid session id.',
      'checkoutSessionId ist keine gültige Sitzungs-ID',
    ],
    ['term must contain some text', 'term muss Text enthalten'],
    ['email must be an email', 'email muss eine gültige E-Mail-Adresse sein'],
    ['active must be a boolean value', 'active muss ein Wahrheitswert (true/false) sein'],
  ])('translates the technical message %j', (english, german) => {
    expect(translateValidationMessage(english, 'de')).toBe(german);
    expect(translateValidationMessage(english, 'en')).toBe(english);
  });

  // The English catalog text is the lookup key, so it has to be exactly what the DTOs emit: otherwise a German caller
  // silently gets English again. Every entry must be produced by a real DTO here.
  it('has an entry for every message the DTOs actually produce, and none that no DTO uses', async () => {
    const produced = [
      ...(await messagesFor(SignupDto, {
        businessName: '',
        ownerName: '',
        email: 'x',
        password: 'abc',
      })),
      ...(await messagesFor(SignupDto, { businessName: 1, ownerName: 1, email: 1, password: 1 })),
      ...(await messagesFor(SignupDto, {
        businessName: 'Cafe',
        ownerName: 'Jane',
        email: 'j@x.com',
        password: 'alllowercase',
      })),
      ...(await messagesFor(VerifyEmailDto, { email: 'x', otp: '12' })),
      ...(await messagesFor(VerifyEmailDto, { email: 'x', otp: 1 })),
      ...(await messagesFor(DeleteAccountDto, { businessName: '' })),
      ...(await messagesFor(UpdateBillingProfileDto, { name: '', email: 'x' })),
      ...(await messagesFor(SetDefaultPaymentMethodDto, { paymentMethodId: '' })),
      ...(await messagesFor(CreateManualReplyDto, { content: '   ' })),
    ];

    const english = Object.values(messagesEn.VALIDATION);
    const unseen = english.filter(text => !produced.includes(text));

    expect(unseen).toEqual([]);
    for (const message of produced.filter(text => english.includes(text))) {
      expect(translateValidationMessage(message, 'de')).not.toBe(message);
    }
  });

  it('keeps the German and English catalogs in step', () => {
    expect(Object.keys(messagesDe.VALIDATION)).toEqual(Object.keys(messagesEn.VALIDATION));
  });
});

describe('ErrorHandlerService.handleBadRequest with a locale', () => {
  const target = new ErrorHandlerService({} as LoggerService);
  const error = Object.assign(new Error('validation failed'), {
    response: {
      message: ['Enter a valid email address.', 'pairs must contain at most 20 entries'],
    },
  });

  it('joins translated sentences, technical ones included', () => {
    expect(target.handleBadRequest(error, 'ctx', 'de').message).toBe(
      `${messagesDe.VALIDATION.EMAIL_INVALID} Pairs darf höchstens 20 Einträge enthalten.`
    );
  });

  it('translates what class-validator itself says for a real DTO, not just our own sentences', async () => {
    const { ListAdminBusinessesQueryDto } =
      await import('../../api/admin/dto/list-admin-businesses-query.dto');
    const errors = await validate(
      plainToInstance(ListAdminBusinessesQueryDto, { page: 0, pageSize: 999 })
    );
    const messages = errors.flatMap(e => Object.values(e.constraints ?? {}));

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(translateValidationMessage(message, 'de')).not.toBe(message);
    }
  });

  it('stays in English without a locale', () => {
    expect(target.handleBadRequest(error, 'ctx').message).toBe(
      'Enter a valid email address. Pairs must contain at most 20 entries.'
    );
  });
});

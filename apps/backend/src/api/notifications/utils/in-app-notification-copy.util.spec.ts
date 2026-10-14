import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';

import { buildNotificationCopy, resolveNotificationLocale } from './in-app-notification-copy.util';

import type { PlannedNotice } from '../types/in-app-notification-event.type';

const notice = (overrides: Partial<PlannedNotice>): PlannedNotice => ({
  type: InAppNotificationType.REVIEW_ESCALATED,
  reviewId: 'review-1',
  generationGroupId: null,
  rating: 2,
  summaryCount: null,
  excludeUserId: null,
  ...overrides,
});

describe('resolveNotificationLocale', () => {
  it.each([
    ['de', 'de'],
    ['en', 'en'],
    [null, 'en'],
    ['fr', 'en'],
  ])('%s -> %s', (input, expected) => {
    expect(resolveNotificationLocale(input)).toBe(expected);
  });
});

describe('buildNotificationCopy', () => {
  it.each(Object.values(InAppNotificationType))('has English and German copy for %s', type => {
    for (const locale of ['en', 'de'] as const) {
      const copy = buildNotificationCopy(locale, notice({ type }));
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.title.length).toBeLessThanOrEqual(255);
      expect(copy.description.length).toBeGreaterThan(0);
    }
  });

  it('renders the two languages differently', () => {
    const en = buildNotificationCopy('en', notice({}));
    const de = buildNotificationCopy('de', notice({}));

    expect(en.title).not.toBe(de.title);
  });

  it('pluralises a summary title', () => {
    const one = buildNotificationCopy('en', notice({ summaryCount: 1 }));
    const many = buildNotificationCopy('en', notice({ summaryCount: 7 }));

    expect(one.title).toBe('1 more review escalated');
    expect(many.title).toBe('7 more reviews escalated');
  });
});

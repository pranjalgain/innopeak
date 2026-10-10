import type { ILocationsPausedEmailJob } from '@bg/interfaces/job.interface';

import { buildLocationsPausedNotice } from './locations-paused.copy';

const job: ILocationsPausedEmailJob = {
  email: 'jane@example.com',
  customerName: 'Jane',
  locale: 'en',
  businessName: 'Coastal Table',
  maxLocations: 1,
  keptLocationNames: ['Harbor St'],
  pausedLocationNames: ['Old Town', 'Pier 9'],
  settingsUrl: 'https://app.example.com/settings?tab=billing',
};

describe('buildLocationsPausedNotice', () => {
  it('names the paused and the still-active locations and links to billing settings', () => {
    const notice = buildLocationsPausedNotice(job);

    expect(notice.subject).toBe('Some locations of Coastal Table are paused');
    expect(notice.body).toContain('allows 1 active location,');
    expect(notice.body).toContain('<li>Old Town</li><li>Pier 9</li>');
    expect(notice.body).toContain('<li>Harbor St</li>');
    expect(notice.actionUrl).toBe(job.settingsUrl);
  });

  it('is written in German for a German-speaking owner', () => {
    const notice = buildLocationsPausedNotice({ ...job, locale: 'de', maxLocations: 2 });

    expect(notice.subject).toBe('Einige Standorte von Coastal Table wurden pausiert');
    expect(notice.body).toContain('Hallo Jane,');
    expect(notice.body).toContain('2 aktive Standorte erlaubt');
  });

  // Names are typed by the owner or come from Google, and land in an HTML body.
  it('escapes business and location names', () => {
    const notice = buildLocationsPausedNotice({
      ...job,
      businessName: '<b>Cafe</b>',
      pausedLocationNames: ['<script>x</script>'],
    });

    expect(notice.body).not.toContain('<script>');
    expect(notice.body).toContain('&lt;script&gt;');
    expect(notice.body).toContain('&lt;b&gt;Cafe&lt;/b&gt;');
  });

  // Regression: an empty name gave "Hi ," and a blank business name a subject with a hole in it.
  it('reads naturally when the owner or business name is blank', () => {
    const notice = buildLocationsPausedNotice({ ...job, customerName: '  ', businessName: '' });

    expect(notice.subject).toBe('Some of your locations are paused');
    expect(notice.body).toContain('Hi there,');
    expect(notice.body).toContain('Your business is on the Free plan');
    expect(notice.body).not.toContain('Hi ,');
  });
});

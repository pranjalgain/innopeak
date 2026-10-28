import { NoopEmailProvider } from './noop.provider';

describe('NoopEmailProvider', () => {
  const target = new NoopEmailProvider();

  // It logs instead of sending, so it can never count as an email service being set up.
  it('is never configured', () => {
    expect(target.isConfigured()).toBe(false);
  });

  it('still answers a send, so callers carry on', async () => {
    await expect(
      target.send({ to: 'jane@thecoffeehouse.com', subject: 'Hello', text: 'Hi' })
    ).resolves.toMatchObject({ messageId: expect.stringMatching(/^noop-/) });
  });
});

import { describe, expect, it } from 'vitest';

import request from 'supertest';

import { createApp } from './app';
import { reset } from './store/gbp-reply-store';

describe('azure-openai chat completions', () => {
  it('composes a reply that echoes the real rating/reviewer/text pulled from the prompt', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/azure-openai/deployments/gpt-4o/chat/completions')
      .send({
        messages: [
          { role: 'system', content: 'You are drafting a reply.' },
          {
            role: 'user',
            content:
              'You are replying on behalf of The Coastal Table to a 2-star review from Marcus.\n\n' +
              'Review: "A 40-minute wait on a confirmed booking isn\'t acceptable."',
          },
        ],
      });

    expect(response.status).toBe(200);
    const content = response.body.choices[0].message.content as string;
    expect(content).toContain('Marcus');
    expect(content.toLowerCase()).toMatch(/sorry|make it right/);
    expect(response.body.choices[0].finish_reason).toBe('stop');
    expect(response.body.usage.prompt_tokens).toBeGreaterThan(0);
  });

  it('reacts differently to a high rating than a low one', async () => {
    const app = createApp();
    const promptFor = (rating: number): string =>
      `You are replying on behalf of The Coastal Table to a ${rating}-star review from Jane.\n\nReview: "Loved it!"`;

    const low = await request(app)
      .post('/azure-openai/deployments/gpt-4o/chat/completions')
      .send({ messages: [{ role: 'user', content: promptFor(1) }] });
    const high = await request(app)
      .post('/azure-openai/deployments/gpt-4o/chat/completions')
      .send({ messages: [{ role: 'user', content: promptFor(5) }] });

    expect(low.body.choices[0].message.content).not.toEqual(high.body.choices[0].message.content);
  });

  it('returns a JSON array of N distinct replies when the system prompt asks for a multi-option completion', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/azure-openai/deployments/gpt-4o/chat/completions')
      .send({
        messages: [
          {
            role: 'system',
            content:
              'Write exactly 3 distinct reply options for this same review, each a complete, ' +
              'standalone reply. Respond with ONLY a JSON array of exactly 3 strings.',
          },
          {
            role: 'user',
            content:
              'You are replying on behalf of The Coastal Table to a 1-star review from Alex.\n\n' +
              'Review: "Terrible service."',
          },
        ],
      });

    expect(response.status).toBe(200);
    const parsed = JSON.parse(response.body.choices[0].message.content as string) as string[];
    expect(parsed).toHaveLength(3);
    expect(new Set(parsed).size).toBe(3);
    for (const option of parsed) {
      expect(option).toContain('Alex');
    }
  });

  it('still returns a single plain-text reply when no multi-option instruction is present', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/azure-openai/deployments/gpt-4o/chat/completions')
      .send({
        messages: [
          { role: 'system', content: 'You are drafting a reply.' },
          {
            role: 'user',
            content:
              'You are replying on behalf of The Coastal Table to a 5-star review from Priya.\n\n' +
              'Review: "Loved it!"',
          },
        ],
      });

    expect(() => JSON.parse(response.body.choices[0].message.content as string)).toThrow();
  });
});

describe('gbp reply emulation', () => {
  it('returns null reviewReply for a review nothing has posted to yet', async () => {
    reset();
    const app = createApp();

    const response = await request(app).get(
      '/v4/accounts/acc-1/locations/loc-1/reviews/review-1'
    );

    expect(response.status).toBe(200);
    expect(response.body.reviewReply).toBeNull();
  });

  it('a PUT reply is visible to a later GET for the same review', async () => {
    reset();
    const app = createApp();

    await request(app)
      .put('/v4/accounts/acc-1/locations/loc-1/reviews/review-2/reply')
      .send({ comment: 'Thanks for the feedback!' });

    const response = await request(app).get(
      '/v4/accounts/acc-1/locations/loc-1/reviews/review-2'
    );

    expect(response.body.reviewReply.comment).toBe('Thanks for the feedback!');
    expect(response.body.reviewReply.updateTime).toBeTruthy();
  });

  it('__seed-external-reply makes a review look already-replied-to, for testing the freshness-check abort path', async () => {
    reset();
    const app = createApp();

    await request(app)
      .post('/gbp/__seed-external-reply')
      .send({ reviewId: 'review-3', comment: 'Replied by the owner directly.' });

    const response = await request(app).get(
      '/v4/accounts/acc-1/locations/loc-1/reviews/review-3'
    );
    expect(response.body.reviewReply.comment).toBe('Replied by the owner directly.');
  });

  it('__force-failure makes exactly the next PUT reply fail, then recovers', async () => {
    reset();
    const app = createApp();

    await request(app).post('/gbp/__force-failure');

    const failed = await request(app)
      .put('/v4/accounts/acc-1/locations/loc-1/reviews/review-4/reply')
      .send({ comment: 'This should fail.' });
    expect(failed.status).toBe(500);

    const retried = await request(app)
      .put('/v4/accounts/acc-1/locations/loc-1/reviews/review-4/reply')
      .send({ comment: 'This should succeed.' });
    expect(retried.status).toBe(200);
  });

  it('__reset clears all state', async () => {
    const app = createApp();
    await request(app)
      .put('/v4/accounts/acc-1/locations/loc-1/reviews/review-5/reply')
      .send({ comment: 'Will be cleared.' });

    await request(app).post('/gbp/__reset');

    const response = await request(app).get(
      '/v4/accounts/acc-1/locations/loc-1/reviews/review-5'
    );
    expect(response.body.reviewReply).toBeNull();
  });
});

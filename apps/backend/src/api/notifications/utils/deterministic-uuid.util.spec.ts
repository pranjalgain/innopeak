import { deterministicUuid } from './deterministic-uuid.util';

describe('deterministicUuid', () => {
  it('is the same for the same key and different for another', () => {
    expect(deterministicUuid('escalated:review-1')).toBe(deterministicUuid('escalated:review-1'));
    expect(deterministicUuid('escalated:review-1')).not.toBe(
      deterministicUuid('escalated:review-2')
    );
  });

  it('is a valid UUID, so the uuid column accepts it', () => {
    expect(deterministicUuid('anything')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

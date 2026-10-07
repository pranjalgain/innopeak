import { excerpt, type ExtractedReviewContext } from './extract-review-context';

/**
 * Reacts to the extracted rating/reviewer/text so mock output differs across reviews.
 * `variantIndex` makes an escalated review's multiple snippets distinct; there are 3 variants per
 * bucket, matching `MAX_AI_REPLY_COUNT`.
 */
export function composeMockReply(ctx: ExtractedReviewContext, variantIndex = 0): string {
  const name = ctx.reviewerName ?? 'there';
  const quoted = ctx.reviewText ? ` — "${excerpt(ctx.reviewText)}"` : '';

  if (ctx.rating !== null && ctx.rating <= 2) {
    const variants = [
      `Hi ${name}, thank you for taking the time to share this${quoted}. We're sorry to hear ` +
        `your experience didn't meet the mark, and we'd like to make it right — please reach ` +
        `out directly so we can follow up.`,
      `${name}, we're genuinely sorry this is how your visit went${quoted}. That's not the ` +
        `standard we hold ourselves to, and we'd welcome the chance to put it right — please ` +
        `get in touch directly.`,
      `Thank you for the honest feedback, ${name}${quoted}. We take this seriously and would ` +
        `like to understand what happened — please reach out so we can follow up personally.`,
    ];
    return variants[variantIndex % variants.length] as string;
  }
  if (ctx.rating !== null && ctx.rating >= 4) {
    const variants = [
      `Thank you so much, ${name}!${quoted} We're thrilled you had a great experience and ` +
        `hope to see you again soon.`,
      `${name}, this made our day!${quoted} Thank you for the kind words — we can't wait to ` +
        `welcome you back.`,
      `We really appreciate you sharing this, ${name}${quoted}. So glad it was a great visit, ` +
        `and we hope to see you again!`,
    ];
    return variants[variantIndex % variants.length] as string;
  }
  const variants = [
    `Thanks for your feedback, ${name}!${quoted} We appreciate you sharing your thoughts and ` +
      `will keep working to improve.`,
    `${name}, thank you for taking the time to leave this review${quoted}. We're always ` +
      `looking to do better and appreciate the input.`,
    `Appreciate you sharing this, ${name}${quoted} — feedback like yours helps us keep ` +
      `improving.`,
  ];
  return variants[variantIndex % variants.length] as string;
}

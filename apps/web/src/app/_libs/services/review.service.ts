import { MOCK_REVIEWS } from "@/app/_libs/mock-data/reviews";
import type { Review } from "@/types/domain";

/**
 * Review Queue service. Mock implementation — becomes a real backend call
 * (with server-side filtering/pagination) once that API exists. Hooks and
 * components only ever call `useReviewQueue`/`useReviewDetail`, never this
 * class directly.
 */
export class ReviewService {
  static async getReviews(): Promise<Review[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_REVIEWS;
  }

  static async getReviewById(id: string): Promise<Review | null> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const review = MOCK_REVIEWS.find((r) => r.id === id);
    return review ? structuredClone(review) : null;
  }

  /** Mocks a full-resource PUT — the hook owns interactive state between saves. */
  static async updateReview(review: Review): Promise<Review> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return review;
  }
}

import type { Review, ReviewClassification, ReviewQueueFilters, ReviewReplyDraft } from "@/types/domain";

import { ApiClient } from "./api-client";

/** The API's own classification values. The frontend union also carries "unclassified", which the
 * API does not accept — no column backs it, so sending it would be a 400. */
const API_CLASSIFICATIONS: ReviewClassification[] = [
  "auto_reply_candidate",
  "escalated",
  "pending_classification",
];

export interface ReviewQueryOptions {
  page?: number;
  pageSize?: number;
  filters?: Partial<ReviewQueueFilters>;
}

export interface ReviewPage {
  reviews: Review[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ApiLatestResponse {
  id: string;
  status: ReviewReplyDraft["status"];
  responseType: string;
  source: string;
  createdAt: string;
}

interface ApiReviewListItem {
  id: string;
  locationId: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  reviewedAt: string | null;
  classification: ReviewClassification;
  escalationReason: Review["escalationReason"];
  status: Review["status"];
  responseCount: number;
  latestResponse: ApiLatestResponse | null;
}

interface ApiReviewResponse {
  id: string;
  label: string;
  content: string;
  originalContent: string | null;
  status: ReviewReplyDraft["status"];
  promptId?: string | null;
  promptVersion?: number | null;
  createdAt: string;
  decidedAt: string | null;
}

interface ApiReviewDetail extends ApiReviewListItem {
  externalReviewId: string;
  externalUpdatedAt: string | null;
  responses: ApiReviewResponse[];
}

interface ApiReviewList {
  data: ApiReviewListItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * The review queue, backed by `GET /v1/reviews`.
 *
 * Filtering moved to the server: the previous version loaded every review and filtered a
 * fully-materialized array in the browser, which is fine for 12 mock rows and is not fine once a
 * backfill has imported a business's whole history.
 */
export class ReviewService {
  static async getReviews(options: ReviewQueryOptions = {}): Promise<ReviewPage> {
    const query = new URLSearchParams();
    const { page = 1, pageSize = 20, filters } = options;

    query.set("page", String(page));
    query.set("pageSize", String(pageSize));

    if (filters?.status && filters.status !== "all") {
      query.set("status", filters.status);
    }
    // "unclassified" is silently dropped rather than sent: it is a frontend-only value the API
    // would reject with a 400, and a validation error is a worse answer than an unfiltered list.
    if (
      filters?.classification &&
      filters.classification !== "all" &&
      API_CLASSIFICATIONS.includes(filters.classification)
    ) {
      query.set("classification", filters.classification);
    }
    if (filters?.search?.trim()) {
      query.set("search", filters.search.trim());
    }

    const response = await ApiClient.request<ApiReviewList>(`/v1/reviews?${query.toString()}`);

    return {
      reviews: response.data.map((item) => this.toReview(item)),
      total: response.meta.total,
      page: response.meta.page,
      pageSize: response.meta.pageSize,
      totalPages: response.meta.totalPages,
    };
  }

  static async getReviewById(id: string): Promise<Review | null> {
    const detail = await ApiClient.request<ApiReviewDetail>(`/v1/reviews/${id}`);

    return {
      ...this.toReview(detail),
      replyDrafts: detail.responses.map((response) => this.toReplyDraft(response)),
    };
  }

  /**
   * Approve/reject are not wired to the backend yet: those routes act on AI-generated drafts, and
   * nothing generates drafts until the review-pipeline module ships. Kept as a local echo so the
   * detail screen's interactions still work against a backfilled review's imported reply.
   */
  static async updateReview(review: Review): Promise<Review> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return review;
  }

  private static toReview(item: ApiReviewListItem): Review {
    return {
      id: item.id,
      // The API returns null for an anonymous or anonymized reviewer; the shipped UI expects a
      // string, so this is the one place the placeholder is applied rather than in every component.
      reviewerName: item.reviewerName ?? "Anonymous",
      rating: this.toRating(item.rating),
      reviewText: item.reviewText ?? "",
      reviewedAt: item.reviewedAt ?? "",
      classification: item.classification,
      escalationReason: item.escalationReason,
      status: item.status,
      // A list row carries only its latest response; the detail route returns all of them. Mapping
      // the summary into a one-element array keeps the badge logic identical on both screens.
      replyDrafts: item.latestResponse
        ? [
            {
              id: item.latestResponse.id,
              label: "A",
              content: "",
              originalContent: "",
              status: item.latestResponse.status,
              promptId: "",
              promptVersion: 0,
              createdAt: item.latestResponse.createdAt,
              decidedAt: null,
            },
          ]
        : [],
    };
  }

  private static toReplyDraft(response: ApiReviewResponse): ReviewReplyDraft {
    return {
      id: response.id,
      label: response.label,
      content: response.content,
      // Null for an imported historical reply and a manual one — neither ever had an AI draft.
      // Falling back to `content` keeps the "edited" comparison in the card a no-op rather than
      // showing an empty "original".
      originalContent: response.originalContent ?? response.content,
      status: response.status,
      promptId: response.promptId ?? "",
      promptVersion: response.promptVersion ?? 0,
      createdAt: response.createdAt,
      decidedAt: response.decidedAt,
    };
  }

  /** `reviews_rating_check` guarantees 1-5 in the database; this narrows the wire `number`. */
  private static toRating(rating: number): Review["rating"] {
    const clamped = Math.min(5, Math.max(1, Math.round(rating)));
    return clamped as Review["rating"];
  }
}

import type { ReviewsControllerListReviewsV1ClassificationEnum } from "@innopeak/client-sdk";

import { reviewsApi } from "@/app/_libs/api-sdk/reviews-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type {
  Review,
  ReviewClassification,
  ReviewQueueFilters,
  ReviewReplyDraft,
} from "@/types/domain";

/** The API's classification values; the frontend union also carries "unclassified", which the API rejects with a 400. */
const API_CLASSIFICATIONS: ReviewClassification[] = [
  "auto_reply_candidate",
  "escalated",
  "pending_classification",
];

export interface ReviewQueryOptions {
  page?: number;
  pageSize?: number;
  filters?: Partial<ReviewQueueFilters>;
  /** The active business (`locations.id`), not a user-facing filter, so kept apart from `filters`. Omitted means every confirmed location. */
  locationId?: string;
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
  postedAt?: string | null;
  errorMessage?: string | null;
}

/** The raw seven-value `response_status` from `GET .../post-status`, the only route that distinguishes a delivered reply from one waiting or failed. */
export type ResponseDeliveryStatus =
  "draft" | "pending_approval" | "approved" | "rejected" | "posted" | "post_failed" | "superseded";

export interface PostStatus {
  status: ResponseDeliveryStatus;
  postedAt: string | null;
  errorMessage: string | null;
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

/** Filtering is server-side: filtering a fully loaded array in the browser does not scale to a backfilled history. */
export class ReviewService {
  static async getReviews(options: ReviewQueryOptions = {}): Promise<ReviewPage> {
    const { page = 1, pageSize = 20, filters, locationId } = options;

    // "unclassified" is dropped, not sent: the API would 400 and an error is worse than an unfiltered list.
    // The cast is safe: `API_CLASSIFICATIONS` is checked above and matches the SDK enum, but `Array.includes` does not narrow.
    const classification =
      filters?.classification &&
      filters.classification !== "all" &&
      API_CLASSIFICATIONS.includes(filters.classification)
        ? (filters.classification as ReviewsControllerListReviewsV1ClassificationEnum)
        : undefined;

    const apiResponse = await reviewsApi.reviewsControllerListReviewsV1({
      page,
      pageSize,
      status: filters?.status && filters.status !== "all" ? filters.status : undefined,
      classification,
      locationId,
      search: filters?.search?.trim() || undefined,
    });
    const response = unwrap<ApiReviewList>(apiResponse.data);

    return {
      reviews: response.data.map((item) => this.toReview(item)),
      total: response.meta.total,
      page: response.meta.page,
      pageSize: response.meta.pageSize,
      totalPages: response.meta.totalPages,
    };
  }

  static async getReviewById(id: string): Promise<Review | null> {
    const apiResponse = await reviewsApi.reviewsControllerGetReviewV1({ reviewId: id });
    const detail = unwrap<ApiReviewDetail>(apiResponse.data);

    return {
      ...this.toReview(detail),
      replyDrafts: detail.responses.map((response) => this.toReplyDraft(response)),
    };
  }

  /** Omit `content` to approve the draft as-is. Whether this also posts depends on the tenant's auto-post setting; the draft is `approved` either way, and delivery is read with `getPostStatus`. */
  static async approveReply(
    reviewId: string,
    responseId: string,
    content?: string,
  ): Promise<ReviewReplyDraft> {
    const apiResponse = await reviewsApi.reviewsControllerApproveReplyV1({
      reviewId,
      responseId,
      approveReplyDto: { content },
    });
    return this.toReplyDraft(unwrap<ApiReviewResponse>(apiResponse.data));
  }

  /** Records who rejected it and when; no free-text reason. */
  static async rejectReply(reviewId: string, responseId: string): Promise<ReviewReplyDraft> {
    const apiResponse = await reviewsApi.reviewsControllerRejectReplyV1({ reviewId, responseId });
    return this.toReplyDraft(unwrap<ApiReviewResponse>(apiResponse.data));
  }

  /** The explicit step when auto-post is off. */
  static async postReply(reviewId: string, responseId: string): Promise<void> {
    await reviewsApi.reviewsControllerPostResponseV1({ reviewId, responseId });
  }

  static async retryPost(reviewId: string, responseId: string): Promise<void> {
    await reviewsApi.reviewsControllerRetryPostV1({ reviewId, responseId });
  }

  static async getPostStatus(reviewId: string, responseId: string): Promise<PostStatus> {
    const apiResponse = await reviewsApi.reviewsControllerGetPostStatusV1({ reviewId, responseId });
    const { status, postedAt, errorMessage } = unwrap<{
      status: ResponseDeliveryStatus;
      postedAt: string | null;
      errorMessage: string | null;
    }>(apiResponse.data);
    return { status, postedAt, errorMessage };
  }

  /** Lands already approved; there is no draft to approve. */
  static async createManualReply(reviewId: string, content: string): Promise<string> {
    const apiResponse = await reviewsApi.reviewsControllerCreateManualReplyV1({
      reviewId,
      createManualReplyDto: { content },
    });
    return unwrap<{ id: string }>(apiResponse.data).id;
  }

  private static toReview(item: ApiReviewListItem): Review {
    return {
      id: item.id,
      // null for an anonymous/anonymized reviewer; the placeholder is applied here, not in every component.
      reviewerName: item.reviewerName ?? "Anonymous",
      rating: this.toRating(item.rating),
      reviewText: item.reviewText ?? "",
      reviewedAt: item.reviewedAt ?? "",
      classification: item.classification,
      escalationReason: item.escalationReason,
      status: item.status,
      // A list row carries only its latest response; wrapping it in an array keeps the badge logic identical to the detail screen.
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
              postedAt: null,
              errorMessage: null,
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
      // null for imported historical and manual replies (no AI draft); falling back to `content` keeps the card's "edited" comparison a no-op.
      originalContent: response.originalContent ?? response.content,
      status: response.status,
      promptId: response.promptId ?? "",
      promptVersion: response.promptVersion ?? 0,
      createdAt: response.createdAt,
      decidedAt: response.decidedAt,
      postedAt: response.postedAt ?? null,
      errorMessage: response.errorMessage ?? null,
    };
  }

  /** `reviews_rating_check` guarantees 1-5 in the database; this narrows the wire `number`. */
  private static toRating(rating: number): Review["rating"] {
    const clamped = Math.min(5, Math.max(1, Math.round(rating)));
    return clamped as Review["rating"];
  }
}

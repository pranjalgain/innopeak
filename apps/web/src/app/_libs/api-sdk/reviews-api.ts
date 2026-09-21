import { ReviewsApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const reviewsApi = new ReviewsApi(apiConfig);

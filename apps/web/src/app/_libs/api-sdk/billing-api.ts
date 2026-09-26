import { BillingApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const billingApi = new BillingApi(apiConfig);

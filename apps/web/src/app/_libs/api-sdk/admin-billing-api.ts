import { AdminBillingApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const adminBillingApi = new AdminBillingApi(apiConfig);

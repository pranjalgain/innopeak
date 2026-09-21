import { AdminAuthApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const adminAuthApi = new AdminAuthApi(apiConfig);

import { AdminStatisticsApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const adminStatisticsApi = new AdminStatisticsApi(apiConfig);

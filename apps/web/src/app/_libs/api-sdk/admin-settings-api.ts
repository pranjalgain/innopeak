import { AdminSettingsApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const adminSettingsApi = new AdminSettingsApi(apiConfig);

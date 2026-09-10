import { SettingsApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const settingsApi = new SettingsApi(apiConfig);

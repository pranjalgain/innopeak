import { NotificationsApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const notificationsApi = new NotificationsApi(apiConfig);

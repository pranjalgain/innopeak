import { AdminUsersApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const adminUsersApi = new AdminUsersApi(apiConfig);

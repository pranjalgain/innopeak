import { AdminBusinessesApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const adminBusinessesApi = new AdminBusinessesApi(apiConfig);

import { PromptsApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const promptsApi = new PromptsApi(apiConfig);

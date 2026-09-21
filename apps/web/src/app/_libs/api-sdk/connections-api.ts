import { ConnectionsApi, ConnectionsSyncApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const connectionsApi = new ConnectionsApi(apiConfig);
export const connectionsSyncApi = new ConnectionsSyncApi(apiConfig);

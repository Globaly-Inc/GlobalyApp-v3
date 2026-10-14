import { createApi } from "@/lib/api/create-api";
import { channelsMockApi } from "./mock-data";
import { channelsRealApi } from "./real-api";

export const channelsApi = createApi({ mock: channelsMockApi, real: channelsRealApi });

export type { AiConfig, ChannelConnection, ChannelKey, ChannelsOverview, WhatsAppTemplate } from "./types";

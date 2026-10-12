import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { AiConfig, ChannelConnection, ChannelKey, ChannelsOverview, WhatsAppTemplate } from "./types";

export const channelsRealApi = {
  listChannels: (): Promise<ChannelsOverview> => httpGet("/channels"),

  /** Zernio's Meta login URL. The browser goes there, then comes back to `return_path`. */
  connectChannel: async (channel: ChannelKey, body: { return_path: string; reconnect_id?: number }): Promise<string> =>
    (await httpPost<{ auth_url: string }>(`/channels/${channel}/connect`, body)).auth_url,

  /** After the redirect: the server checks the account belongs to this organisation, then saves it. */
  confirmChannel: async (channel: ChannelKey, accountId?: string): Promise<ChannelConnection[]> =>
    (await httpPost<{ connections: ChannelConnection[] }>(`/channels/${channel}/confirm`, accountId ? { account_id: accountId } : {})).connections,

  updateChannelAi: async (id: number, body: { ai_mode: "auto" | "suggest"; ai_config: AiConfig }): Promise<ChannelConnection> =>
    (await httpPatch<{ connection: ChannelConnection }>(`/channels/${id}/ai`, body)).connection,

  disconnectChannel: (id: number): Promise<void> => httpDelete(`/channels/${id}`),

  listTemplates: async (id: number): Promise<WhatsAppTemplate[]> =>
    (await httpGet<{ templates: WhatsAppTemplate[] }>(`/channels/${id}/templates`)).templates,
};

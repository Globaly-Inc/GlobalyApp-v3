import { createApi } from "@/lib/api/create-api";
import { embedMockApi } from "./mock-data";
import { embedRealApi } from "./real-api";

export const embedApi = createApi({ mock: embedMockApi, real: embedRealApi });
export type {
  EmbedChatEvent, EmbedContactPrompt, EmbedEndPrompt, EmbedPublicConfig, EmbedStoredMessage,
  EmbedThread, GuestContactRequest, GuestConversationEndRequest, GuestConversationEndResponse,
  GuestMessageRequest,
} from "./types";

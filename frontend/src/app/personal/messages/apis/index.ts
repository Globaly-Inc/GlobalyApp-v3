import { createApi } from "@/lib/api/create-api";
import { messagesMockApi } from "./mock-data";
import { messagesRealApi } from "./real-api";

export const messagesApi = createApi({ mock: messagesMockApi, real: messagesRealApi });
export type {
  EnquiryMessage,
  MessageAttachment,
  MessageReaction,
  MessageThreadSummary,
  StarredMessage,
} from "./types";

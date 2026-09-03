import { createApi } from "@/lib/api/create-api";
import { businessMessagesMockApi } from "./mock-data";
import { businessMessagesRealApi } from "./real-api";

export const businessMessagesApi = createApi({
  mock: businessMessagesMockApi,
  real: businessMessagesRealApi,
});

export type {
  ChatThread,
  EnquiryMessage,
  MessageAttachment,
  MessageReaction,
  MemberCandidate,
  StarredMessage,
  ThreadMember,
  ThreadMembersResult,
  ThreadRole,
} from "./types";

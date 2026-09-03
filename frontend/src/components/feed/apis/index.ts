import { createApi } from "@/lib/api/create-api";
import { feedMockApi } from "./mock-data";
import { feedRealApi } from "./real-api";

export const feedApi = createApi({ mock: feedMockApi, real: feedRealApi });
export type {
  FeedPost, FeedPage, CreatePostInput, ComposeWithAiInput, PostMedia, ReactionGroup,
  FeedComment, CreateCommentInput, Mention, MentionCandidate,
} from "./types";

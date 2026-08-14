import { createApi } from "@/lib/api/create-api";
import { blogMockApi } from "./mock-data";
import { blogRealApi } from "./real-api";

export const blogApi = createApi({ mock: blogMockApi, real: blogRealApi });
export type {
  BlogKeyword, BlogKeywordInput, BlogPost, BlogPostInput, BlogPostListParams, BlogTopic, KeywordDifficulty, Paginated,
} from "./types";

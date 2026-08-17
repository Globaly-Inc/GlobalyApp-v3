import { createApi } from "@/lib/api/create-api";
import { aiMockApi } from "./mock-data";
import { aiRealApi } from "./real-api";

export const aiApi = createApi({ mock: aiMockApi, real: aiRealApi });
export type { ChatSession, Message, CourseCard, SSEEvent, SendMessageInput } from "./types";

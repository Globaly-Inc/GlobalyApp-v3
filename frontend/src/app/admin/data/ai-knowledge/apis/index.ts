import { createApi } from "@/lib/api/create-api";
import { aiKnowledgeMockApi } from "./mock-data";
import { aiKnowledgeRealApi } from "./real-api";

export const aiKnowledgeApi = createApi({ mock: aiKnowledgeMockApi, real: aiKnowledgeRealApi });
export type * from "./types";

import { createApi } from "@/lib/api/create-api";
import { aiWidgetMockApi } from "./mock-data";
import { aiWidgetRealApi } from "./real-api";

export const aiWidgetApi = createApi({ mock: aiWidgetMockApi, real: aiWidgetRealApi });
export type {
  CreateEmbedConfigInput, DeveloperContact, EmbedConfig, EnsureEmbedResult,
  SendSnippetInput, SendSnippetResult, UpdateEmbedConfigInput,
  VisitorCounts, VisitorListParams, VisitorListResult, VisitorProfileEntry,
  VisitorMessage, VisitorStatus, VisitorStatusFilter, WidgetVisitor,
} from "./types";

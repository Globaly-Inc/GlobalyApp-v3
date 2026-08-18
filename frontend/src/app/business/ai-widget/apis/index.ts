import { createApi } from "@/lib/api/create-api";
import { aiWidgetMockApi } from "./mock-data";
import { aiWidgetRealApi } from "./real-api";

export const aiWidgetApi = createApi({ mock: aiWidgetMockApi, real: aiWidgetRealApi });
export type { CreateEmbedConfigInput, EmbedConfig } from "./types";

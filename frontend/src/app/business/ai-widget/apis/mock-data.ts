import { uuid } from "@/lib/utils";
import type { CreateEmbedConfigInput, EmbedConfig } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = 3;
const configs: EmbedConfig[] = [
  {
    id: 1,
    business_id: 1,
    embed_key: "a3b8f2c1-4d5e-6f70-8192-a3b4c5d6e7f8",
    display_name: "Acme University Counsellor",
    logo_url: null,
    brand_color: "#4f46e5",
    custom_instructions: "Always mention our February and July intakes.",
    monthly_credit_limit: 1000,
    credits_used_this_month: 214,
    month_reset_at: "2026-09-01T00:00:00Z",
    is_active: true,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
  },
];

export const aiWidgetMockApi = {
  listConfigs: async (): Promise<EmbedConfig[]> => {
    console.log("[mock] GET /ai-chat/embed/configs");
    await delay(300);
    return [...configs];
  },

  createConfig: async (input: CreateEmbedConfigInput): Promise<EmbedConfig> => {
    console.log("[mock] POST /ai-chat/embed/configs", input);
    await delay(300);
    const config: EmbedConfig = {
      id: seq++,
      business_id: 1,
      embed_key: uuid(),
      display_name: input.display_name ?? null,
      logo_url: input.logo_url ?? null,
      brand_color: input.brand_color ?? null,
      custom_instructions: input.custom_instructions ?? null,
      monthly_credit_limit: input.monthly_credit_limit ?? 1000,
      credits_used_this_month: 0,
      month_reset_at: "2026-09-01T00:00:00Z",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    configs.unshift(config);
    return config;
  },

  deactivateConfig: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /ai-chat/embed/configs/" + id);
    await delay(300);
    const config = configs.find((c) => c.id === id);
    if (config) config.is_active = false;
  },
};

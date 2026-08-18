/** Wire types for the business AI-widget (embed config) API. */

export type EmbedConfig = {
  id: number;
  business_id: number;
  embed_key: string;
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  custom_instructions: string | null;
  monthly_credit_limit: number;
  credits_used_this_month: number;
  month_reset_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateEmbedConfigInput = {
  display_name?: string;
  logo_url?: string;
  brand_color?: string;
  custom_instructions?: string;
  monthly_credit_limit?: number;
};

export type EmbedConfigListResponse = { configs: EmbedConfig[] };

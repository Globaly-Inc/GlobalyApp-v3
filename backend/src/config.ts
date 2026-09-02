// Reads .env and exports a typed, validated config object.
// All env access goes through here — no process.env elsewhere.

import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // Database
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),

  // Auth
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_LOCKOUT_MINUTES: z.coerce.number().default(30),
  SESSION_EXPIRY_DAYS: z.coerce.number().default(30),

  // Server
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().optional(),
  APP_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3001"),

  // Third-party (optional at skeleton stage)
  DRAGONFLY_URL: z.string().optional(),
  LAVINMQ_URL: z.string().default("amqp://guest:guest@localhost:5672"),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().default(587),
  MAIL_USERNAME: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  CHARGEBEE_SITE: z.string().optional(),
  CHARGEBEE_API_KEY: z.string().optional(),

  // Payments (Earn → My Services). Unset outside production selects the dev driver, so the order lifecycle
  // is exercisable locally without a Stripe account. See modules/other-services/payments.
  STRIPE_SECRET_KEY: z.string().optional(),
  // Where the browser reaches the frontend. Checkout must return the buyer to a real origin, and the API's
  // own APP_URL is a different host.
  WEB_APP_URL: z.string().default("http://localhost:3001"),

  // AI / LLM
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_MODEL_LITE: z.string().default("gemini-3.5-flash-lite"),
  // LLM fallback — used when Gemini is unavailable (billing hold, rate limit exhausted, etc.)
  // Set either OPENROUTER_API_KEY or OPENAI_API_KEY; OpenRouter takes precedence if both are set.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-haiku-4.5"),
  // Diagnostic kill-switch for the counsellor's tool loop (Phase 7). "false" reverts every
  // turn to the pre-Phase-7 path (searchAll + plain streamChat) — the A/B for the
  // one-turn-lag investigation. Remove once the lag's root cause is confirmed.
  AI_COUNSELLOR_TOOLS: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  // text-embedding-004 is retired — it 404s on embedContent for current keys.
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),

  // Scrapers
  SCRAPLING_BASE_URL: z.string().optional(),  // base URL of Scrapling's own MCP server (e.g. http://localhost:8123) — /mcp is appended by scraper.ts
  SCRAPLING_API_KEY: z.string().optional(),   // sent as the MCP server's Bearer auth token — must match its SCRAPLING_MCP_AUTH_TOKEN
  CRAWL4AI_BASE_URL: z.string().optional(),  // e.g. https://your-crawl4ai.railway.app
  CRAWL4AI_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),

  // GCP Storage
  GCS_BUCKET_NAME: z.string().optional(),
  GCS_PROJECT_ID: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),             // path to service account JSON
  GCS_SIGNED_URL_EXPIRY: z.coerce.number().default(3600), // seconds, default 1 hour
  GCS_MAX_FILE_SIZE_MB: z.coerce.number().default(10),

  // AgentCIS
  AGENTCIS_BASE_URL: z.string().optional(),
  AGENTCIS_API_KEY: z.string().optional(),

  // Vault
  VAULT_KEK: z.string().optional(),

  // Google Maps (Places Autocomplete + Details for address lookup)
  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  API_URL: parsed.API_URL ?? `http://localhost:${parsed.PORT}`,
  MASTER_DB_URL: `postgresql://${parsed.DB_USERNAME}:${parsed.DB_PASSWORD}@${parsed.DB_HOST}:${parsed.DB_PORT}/${parsed.DB_NAME}`,
};

export type Config = typeof config;

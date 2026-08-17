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
  // text-embedding-004 is retired — it 404s on embedContent for current keys.
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),

  // Scrapers
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
  MASTER_DB_URL: `postgresql://${parsed.DB_USERNAME}:${parsed.DB_PASSWORD}@${parsed.DB_HOST}:${parsed.DB_PORT}/${parsed.DB_NAME}`,
};

export type Config = typeof config;

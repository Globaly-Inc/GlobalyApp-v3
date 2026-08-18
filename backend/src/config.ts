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

  // Stripe. Two consumers with deliberately different unset behaviour:
  //   - modules/other-services/payments: unset outside production selects the dev driver, so the
  //     order lifecycle stays exercisable locally without a Stripe account.
  //   - modules/billing: fails closed with 503 (services/stripe.client.ts); never fakes success,
  //     because credits and subscriptions must not appear to settle when they cannot.
  // TODO(plan §15 decision 6): confirm one Stripe account/key set for both before the C3→E2 rehearsal.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  // Where the browser reaches the frontend. Checkout must return the buyer to a real origin, and the API's
  // own APP_URL is a different host.
  WEB_APP_URL: z.string().default("http://localhost:3001"),

  // AI / LLM
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  // text-embedding-004 is retired — it 404s on embedContent for current keys.
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  // Speech-to-text for scribe (V1 used OpenAI Realtime `gpt-4o-transcribe`).
  // Unset in this deployment, so every transcription path fails closed with 503
  // — see modules/scribe/services/transcription.provider.ts. Never a fake token.
  OPENAI_API_KEY: z.string().optional(),

  // Web push (FCM). Both unset in this deployment, so the push channel and
  // /notifications/push-check fail closed with 503 — see
  // modules/notifications/services/push.client.ts. Never a fabricated send.
  FCM_PROJECT_ID: z.string().optional(),
  /** The service-account JSON, as a single-line string. */
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

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

  // FX rates (exchangerate-api.com — the provider V1 and V2 both use).
  // Unset means the cache can be read but never refilled: modules/fx serves a stale
  // snapshot in preference to failing, and 503s only when nothing is cached.
  FX_API_KEY: z.string().optional(),

  // Cross-app GlobalyAI feed (§3.4). Two separate shared secrets, deliberately not
  // one: outbound export is a read of the whole live catalog, inbound ingest is a
  // write into extraction staging, and a partner that may pull must not
  // automatically be able to push. Both unset here, and both surfaces fail closed
  // with 503 rather than run unauthenticated — see modules/cross-app/shared/sync-auth.ts.
  GLOBALY_AI_SYNC_SECRET: z.string().optional(),
  WEBHOOK_INGEST_SECRET: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  MASTER_DB_URL: `postgresql://${parsed.DB_USERNAME}:${parsed.DB_PASSWORD}@${parsed.DB_HOST}:${parsed.DB_PORT}/${parsed.DB_NAME}`,
};

export type Config = typeof config;

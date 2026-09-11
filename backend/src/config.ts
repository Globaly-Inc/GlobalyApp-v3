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
  /**
   * Fastify `trustProxy` — decides what `req.ip` means, and `req.ip` is the only
   * unforgeable client identity the rate limiter and the guest gate have.
   *
   * Defaults to `loopback` because the backend image ALWAYS runs nginx in front of Fastify
   * in the same container (`Dockerfile`: `service nginx start && npm start`), proxying over
   * localhost with `X-Forwarded-For $proxy_add_x_forwarded_for`. Trusting loopback means
   * Fastify takes the rightmost address nginx appended — the real client — and ignores
   * anything the caller prepended, so header rotation buys nothing.
   *
   * `loopback` rather than the hop count `1`: identical behind nginx, but strictly safer if
   * Fastify is ever exposed directly, where `1` would trust the connecting client itself
   * and hand its own `X-Forwarded-For` straight back.
   *
   * Add ranges if something else goes in FRONT of nginx: a CDN or ALB makes the client one
   * hop further away, so `loopback,<cdn cidr>` is needed or `req.ip` becomes the CDN's
   * address and every visitor shares one rate-limit bucket. Avoid `true` — it trusts the
   * whole chain and returns the attacker-controlled leftmost value.
   */
  TRUST_PROXY: z.string().default("loopback"),

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
  // Non-Google on purpose: this is the fallback for Gemini outages, so it must not share Google's failure domain.
  OPENROUTER_MODEL: z.string().default("openai/gpt-4.1-nano"),
  // text-embedding-004 is retired — it 404s on embedContent for current keys.
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  // Which provider embed() calls. Gemini's embedContent 403s on keys without the Generative
  // Language API enabled, and embed() would then fall back per call — a wasted round trip each
  // time, and vectors from two different spaces in the same column. Point this at "openrouter"
  // to use the fallback key directly, and re-embed after switching either way.
  EMBEDDING_PROVIDER: z.enum(["gemini", "openrouter"]).default("gemini"),

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

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
  // Parent domain for the readable "a session may exist" hint cookie (production: ".globalyai.com"),
  // so app. can read what api. sets. Unset = the API's own host. See modules/auth/refresh-cookie.ts.
  SESSION_HINT_COOKIE_DOMAIN: z.string().optional(),
  // The hint cookie's name. Staging sets its own (globaly_session_staging): staging and production
  // share .globalyai.com, so one name would let a staging sign-out clear production's hint.
  // Must match the frontend's NEXT_PUBLIC_SESSION_HINT_COOKIE.
  SESSION_HINT_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("globaly_session"),

  // Server
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().optional(),
  APP_URL: z.string().default("http://localhost:3000"),
  // Comma-separated browser origins, e.g. "https://app.globalyai.com".
  // Use CORS_ORIGIN_LIST below, never this raw string, as a URL or a cors `origin`.
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
  // The sending domain must be verified with the SMTP provider (SPF/DKIM) before this changes.
  MAIL_FROM: z.string().email().default("noreply@globalyai.com"),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  CHARGEBEE_SITE: z.string().optional(),
  CHARGEBEE_API_KEY: z.string().optional(),

  // Payments (Earn → My Services). Unset outside production selects the dev driver, so the order lifecycle
  // is exercisable locally without a Stripe account. See modules/other-services/payments.
  STRIPE_SECRET_KEY: z.string().optional(),
  // Where the browser reaches the frontend. Checkout must return the buyer to a real origin, and the API's
  // own APP_URL is a different host.
  WEB_APP_URL: z.string().default("http://localhost:3001"),

  // Zernio — WhatsApp, Instagram and Facebook Messenger for the Inbox (modules/channels).
  // Without an API key the channels routes answer 503 and nothing calls Zernio.
  ZERNIO_API_KEY: z.string().optional(),
  ZERNIO_API_URL: z.string().default("https://zernio.com/api"),
  // HMAC secret set on our webhook endpoint in Zernio. Unset: the webhook rejects every event in
  // production and accepts unsigned ones only outside it, so local development works before a
  // secret exists.
  ZERNIO_WEBHOOK_SECRET: z.string().optional(),

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
  // TypeSafe Jev — typed yes/no decisions for the institution-memory learning pipeline (candidate
  // gate, contradiction check, feedback attribution). Optional: unset falls back to the
  // extractor's own flags and the regex filters. See modules/institution-memory/lib/jev.ts.
  TYPESAFE_API_KEY: z.string().optional(),

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

  // Cloudflare visitor-location headers (AI widget branch recommendation). Header NAMES, not
  // values; set one to an empty string to ignore that header. Region headers need Cloudflare's
  // "Add visitor location headers" managed transform.
  CLOUDFLARE_COUNTRY_HEADER: z.string().default("cf-ipcountry"),
  CLOUDFLARE_REGION_HEADER: z.string().default("cf-region"),
  CLOUDFLARE_REGION_CODE_HEADER: z.string().default("cf-region-code"),
});

const parsed = envSchema.parse(process.env);

/** "a, b,,c" -> ["a","b","c"]; trailing slashes dropped, since browsers send Origin without one. */
export function parseOriginList(raw: string): string[] {
  return raw.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
}

export const config = {
  ...parsed,
  API_URL: parsed.API_URL ?? `http://localhost:${parsed.PORT}`,
  CORS_ORIGIN_LIST: parseOriginList(parsed.CORS_ORIGINS),
  MASTER_DB_URL: `postgresql://${parsed.DB_USERNAME}:${parsed.DB_PASSWORD}@${parsed.DB_HOST}:${parsed.DB_PORT}/${parsed.DB_NAME}`,
};

// Two browser origins means the web./app. split: without the hint on their parent domain the
// shared sign-in silently never restores on the other host. Fail at boot, not in the field.
if (config.CORS_ORIGIN_LIST.length > 1 && !config.SESSION_HINT_COOKIE_DOMAIN) {
  throw new Error("SESSION_HINT_COOKIE_DOMAIN is required when CORS_ORIGINS lists more than one origin (e.g. .globalyai.com)");
}

export type Config = typeof config;

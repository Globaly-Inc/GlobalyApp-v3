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

  // Server
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3001"),

  // Third-party (optional at skeleton stage)
  DRAGONFLY_URL: z.string().optional(),
  LAVINMQ_HOST: z.string().default("localhost"),
  LAVINMQ_PORT: z.coerce.number().default(5672),
  LAVINMQ_USERNAME: z.string().default("guest"),
  LAVINMQ_PASSWORD: z.string().default("guest"),
  SMTP_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().default(587),
  MAIL_USERNAME: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  CHARGEBEE_SITE: z.string().optional(),
  CHARGEBEE_API_KEY: z.string().optional(),

  // AI / LLM
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),

  // Scrapers
  CRAWL4AI_BASE_URL: z.string().optional(),  // e.g. https://your-crawl4ai.railway.app
  CRAWL4AI_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),

  // Vault
  VAULT_KEK: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  MASTER_DB_URL: `postgresql://${parsed.DB_USERNAME}:${parsed.DB_PASSWORD}@${parsed.DB_HOST}:${parsed.DB_PORT}/${parsed.DB_NAME}`,
  LAVINMQ_URL: `amqp://${parsed.LAVINMQ_USERNAME}:${parsed.LAVINMQ_PASSWORD}@${parsed.LAVINMQ_HOST}:${parsed.LAVINMQ_PORT}`,
};

export type Config = typeof config;

// Single source of truth for the integration-test database connection.
// Imported by vitest.config.ts (main process) and tests/setup/* (workers).

import pg from "pg";

export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://test:test@localhost:5460/globalyapp_test";

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}

/** Env vars src/config.ts needs, derived from TEST_DATABASE_URL. */
export function testEnv(): Record<string, string> {
  const url = testDatabaseUrl();
  const u = new URL(url);
  return {
    TEST_DATABASE_URL: url,
    NODE_ENV: "test",
    DB_HOST: u.hostname,
    DB_PORT: u.port || "5432",
    DB_USERNAME: decodeURIComponent(u.username),
    DB_PASSWORD: decodeURIComponent(u.password),
    DB_NAME: u.pathname.replace(/^\//, ""),
    JWT_SECRET: process.env.JWT_SECRET || "integration-test-secret",
    // Keep third-party integrations inert during tests.
    LAVINMQ_URL: "amqp://guest:guest@127.0.0.1:1",
    // Pinned empty on purpose. src/config.ts does `import "dotenv/config"`, so a
    // real key in backend/.env would otherwise reach the suite and silently flip
    // every fail-closed assertion (AI paths are specified to 503 without a key) —
    // the tests would still pass while proving the opposite of what they claim.
    // Tests that want a configured provider inject one; they never read the env.
    GEMINI_API_KEY: "",
    // Same reasoning for speech-to-text. scribe.test.ts asserts
    // isTranscriptionConfigured() === false as its precondition, because the
    // whole point of that path is a 503 with the transcript still saved.
    OPENAI_API_KEY: "",
    // Same reasoning for storage. storage-preview-url.test.ts asserts
    // isConfigured() === false as its precondition, because an unsignable bucket is
    // exactly the condition resolvePreviewUrl's fail-soft path exists for. Leaving
    // this to .env means whoever configures GCS locally breaks that suite.
    GCS_BUCKET_NAME: "",
    // Same reasoning again for web push. push-client.test.ts asserts
    // isPushConfigured() === false as its precondition — an unconfigured provider is
    // exactly the condition the 503 exists for — so real FCM credentials in
    // backend/.env would leave the suite green while proving the opposite.
    FCM_PROJECT_ID: "",
    FCM_SERVICE_ACCOUNT_JSON: "",
    CORS_ORIGINS: "http://localhost:3001",
  };
}

/**
 * Probe the test database. Returns false (never throws) when unreachable so the
 * integration suite can skip with a warning instead of hanging or failing.
 */
export async function probeTestDatabase(timeoutMs = 3000): Promise<boolean> {
  const client = new pg.Client({
    connectionString: testDatabaseUrl(),
    connectionTimeoutMillis: timeoutMs,
    // ponytail: statement_timeout guards against a wedged server accepting TCP but never replying
    statement_timeout: timeoutMs,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export const DB_UNREACHABLE_WARNING =
  `\n[integration] Test database unreachable at ${testDatabaseUrl()} — skipping integration tests.\n` +
  `[integration] Start it and re-run, or set TEST_DATABASE_URL.\n`;

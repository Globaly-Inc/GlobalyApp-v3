// Centralized error → HTTP response mapping.
// Catches AppError subclasses and returns structured JSON responses.

import fp from "fastify-plugin";
import { AppError } from "../../shared/errors.js";
import { createChildLogger } from "../../shared/logger.js";
import { config } from "../../config.js";

const logger = createChildLogger("error-handler");

export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((error, _req, reply) => {
    const err = error as Record<string, unknown>;

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }

    // Zod validation errors
    if (err.name === "ZodError") {
      return reply.status(400).send({
        error: "Validation failed",
        details: err.issues,
      });
    }

    // Fastify validation errors
    if (err.validation) {
      return reply.status(400).send({
        error: "Validation failed",
        details: err.validation,
      });
    }

    // @fastify/multipart — upload exceeded the configured fileSize limit
    if (err.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({
        error: `File exceeds the maximum size of ${config.GCS_MAX_FILE_SIZE_MB}MB`,
        code: "FILE_TOO_LARGE",
      });
    }

    // Postgres unique constraint violation (code 23505)
    if (err.code === "23505") {
      const detail = String(err.detail ?? "");
      const match = detail.match(/Key \((\w+)\)/);
      const field = match?.[1] ?? "value";
      return reply.status(409).send({
        error: `${field} already exists`,
        code: "CONFLICT",
      });
    }

    // Fastify-native errors that already carry their own 4xx status.
    //
    // @fastify/rate-limit is the one that matters: it throws FST_ERR_RATE_LIMIT with
    // statusCode 429, and without this branch it fell through to the generic 500
    // below — so EVERY throttled route in the app answered "Internal server error"
    // instead of "Too Many Requests". A client cannot back off from a 500, and an
    // operator reading dashboards sees an outage where there was a working limiter.
    // Found by tests/integration/ai-embed-rate-limit.test.ts; the fix is here rather
    // than in that module because all 13 rate-limited route files shared the bug.
    //
    // Scoped to 4xx on purpose: a 5xx must keep its message hidden behind the
    // generic 500 response below, and only client-fault statuses are safe to echo.
    const nativeStatus = typeof err.statusCode === "number" ? err.statusCode : 0;
    if (nativeStatus >= 400 && nativeStatus < 500) {
      return reply.status(nativeStatus).send({
        error: error instanceof Error ? error.message : "Request rejected",
        code: typeof err.code === "string" ? err.code : undefined,
      });
    }

    // Unexpected errors — log and return 500
    logger.error(error instanceof Error ? error.message : "Unknown error", { stack: error instanceof Error ? error.stack : undefined });
    return reply.status(500).send({ error: "Internal server error" });
  });
});

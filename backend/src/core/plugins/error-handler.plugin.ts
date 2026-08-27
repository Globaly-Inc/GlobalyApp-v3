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

    // Errors that already carry an HTTP status (@fastify/rate-limit's 429, a plugin's 4xx). Falling
    // through to the 500 branch below hid these completely — a rate-limited client was told
    // "Internal server error" and had no way to know it should back off instead of retrying.
    if (typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send({
        error: error instanceof Error ? error.message : "Request failed",
        code: typeof err.code === "string" ? err.code : undefined,
      });
    }

    // Unexpected errors — log and return 500
    logger.error(error instanceof Error ? error.message : "Unknown error", { stack: error instanceof Error ? error.stack : undefined });
    return reply.status(500).send({ error: "Internal server error" });
  });
});

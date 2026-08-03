// Centralized error → HTTP response mapping.
// Catches AppError subclasses and returns structured JSON responses.

import fp from "fastify-plugin";
import { AppError } from "../../shared/errors.js";
import { createChildLogger } from "../../shared/logger.js";

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

    // Unexpected errors — log and return 500
    logger.error(error instanceof Error ? error.message : "Unknown error", { stack: error instanceof Error ? error.stack : undefined });
    return reply.status(500).send({ error: "Internal server error" });
  });
});

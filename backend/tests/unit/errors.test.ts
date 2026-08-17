import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../src/shared/errors.js";
import { errorHandlerPlugin } from "../../src/core/plugins/error-handler.plugin.js";

const CASES = [
  { name: "BadRequestError", make: () => new BadRequestError(), status: 400, code: "BAD_REQUEST" },
  { name: "UnauthorizedError", make: () => new UnauthorizedError(), status: 401, code: "UNAUTHORIZED" },
  { name: "ForbiddenError", make: () => new ForbiddenError(), status: 403, code: "FORBIDDEN" },
  { name: "NotFoundError", make: () => new NotFoundError(), status: 404, code: "NOT_FOUND" },
  { name: "ConflictError", make: () => new ConflictError(), status: 409, code: "CONFLICT" },
] as const;

describe("error classes", () => {
  it.each(CASES)("$name carries status $status and code $code", ({ make, status, code }) => {
    const err = make();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
  });

  it("names itself after its own class so logs are attributable", () => {
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new ConflictError().name).toBe("ConflictError");
  });

  it("keeps a caller-supplied message", () => {
    expect(new ForbiddenError("Switch to a business context first").message).toBe(
      "Switch to a business context first",
    );
  });
});

describe("error handler HTTP mapping", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);

    for (const c of CASES) {
      app.get(`/throw/${c.name}`, async () => {
        throw c.make();
      });
    }

    app.get("/throw/plain", async () => {
      throw new Error("kaboom: secret internal detail");
    });

    app.get("/throw/pg-unique", async () => {
      const err = Object.assign(new Error("duplicate key"), {
        code: "23505",
        detail: "Key (email)=(a@b.c) already exists.",
      });
      throw err;
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(CASES)("$name maps to HTTP $status", async ({ name, status, code }) => {
    const res = await app.inject({ method: "GET", url: `/throw/${name}` });
    expect(res.statusCode).toBe(status);
    expect(res.json()).toEqual({ error: expect.any(String), code });
  });

  it.each(CASES)("$name response body leaks no stack trace", async ({ name }) => {
    const res = await app.inject({ method: "GET", url: `/throw/${name}` });
    const body = res.body;
    expect(res.json()).not.toHaveProperty("stack");
    expect(body).not.toMatch(/\bat\s+.+:\d+:\d+/);
    expect(body).not.toContain("node_modules");
    expect(body).not.toContain(".ts:");
  });

  it("maps an unexpected error to a generic 500 with no internals", async () => {
    const res = await app.inject({ method: "GET", url: "/throw/plain" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Internal server error" });
    expect(res.body).not.toContain("kaboom");
    expect(res.body).not.toMatch(/\bat\s+.+:\d+:\d+/);
  });

  it("maps a Postgres unique violation to 409 CONFLICT", async () => {
    const res = await app.inject({ method: "GET", url: "/throw/pg-unique" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "email already exists", code: "CONFLICT" });
    expect(res.body).not.toMatch(/\bat\s+.+:\d+:\d+/);
  });
});

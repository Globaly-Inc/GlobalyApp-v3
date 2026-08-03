// AsyncLocalStorage-based request context.
// Provides request-scoped values (request-id, logger) without threading them through every function.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";

interface RequestContext {
  requestId: string;
}

export const requestStore = new AsyncLocalStorage<RequestContext>();

export const requestContextPlugin = fp(async (app) => {
  app.addHook("onRequest", async (req, reply) => {
    const requestId = (req.headers["x-request-id"] as string) || randomUUID();
    reply.header("x-request-id", requestId);

    requestStore.enterWith({ requestId });
  });
});

/** Get the current request context (call from anywhere during a request) */
export function getRequestContext(): RequestContext | undefined {
  return requestStore.getStore();
}

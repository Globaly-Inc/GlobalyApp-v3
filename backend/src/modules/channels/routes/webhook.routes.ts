// PUBLIC: Zernio's webhook — one endpoint for every organisation.
//
// It only verifies, stores and queues. All the work (finding the organisation, AI replies,
// sending) happens in the channel-events worker, so this answers within a second and Zernio
// never times out and retries an event we already have.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { BadRequestError, UnauthorizedError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { queueService } from "../../../shared/queue/queueService.js";
import * as zernio from "../lib/zernio-client.js";
import * as zernioRepo from "../repositories/zernio.repository.js";
import { CHANNEL_QUEUES } from "../consts.js";

const logger = createChildLogger("zernio-webhook");

/** Zernio retries in bursts; generous, but still a ceiling on a public endpoint. */
const WEBHOOK_RATE = { max: 1200, timeWindow: "1 minute" } as const;

const rawBodies = new WeakMap<FastifyRequest, Buffer>();

export async function zernioWebhookRoutes(app: FastifyInstance) {
  // The signature is over the RAW bytes, so this plugin keeps them. Encapsulated: every other
  // route keeps Fastify's normal JSON parser.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const buf = body as Buffer;
    rawBodies.set(req, buf);
    try {
      done(null, buf.length ? JSON.parse(buf.toString("utf8")) : {});
    } catch {
      done(new BadRequestError("Invalid JSON"), undefined);
    }
  });

  app.post("/webhooks/zernio", { config: { rateLimit: WEBHOOK_RATE } }, async (req, reply) => {
    // Zernio's docs say X-Zernio-*, but it actually sends X-Late-* (its former name); accept both.
    const header = (name: string) => {
      const v = req.headers[`x-zernio-${name}`] ?? req.headers[`x-late-${name}`];
      return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
    };
    if (!zernio.verifySignature(rawBodies.get(req) ?? Buffer.alloc(0), header("signature"))) {
      throw new UnauthorizedError("Invalid webhook signature");
    }
    const body = (req.body ?? {}) as { id?: unknown; event?: unknown; account?: { accountId?: unknown; id?: unknown } };
    const eventId = header("event-id") ?? (typeof body.id === "string" ? body.id : undefined);
    const event = typeof body.event === "string" ? body.event : header("event");
    if (!eventId || !event) throw new BadRequestError("Missing event id or name");
    if (event === "webhook.test") return reply.send({ ok: true });

    const accountId = typeof body.account?.accountId === "string" ? body.account.accountId
      : typeof body.account?.id === "string" ? body.account.id : null;
    const rowId = await zernioRepo.insertEvent({ event_id: eventId, event, account_id: accountId, payload: body });
    // null = already stored (a retry): acknowledge without queueing it twice. A failed publish is
    // picked up by the worker's sweep, so the event is never lost once stored.
    if (rowId != null) {
      await queueService.publish(CHANNEL_QUEUES.EVENTS, { eventRowId: rowId })
        .catch((err) => logger.warn("Event stored but not queued; the sweep will pick it up", { eventId, err: err instanceof Error ? err.message : String(err) }));
    }
    return reply.send({ ok: true });
  });
}

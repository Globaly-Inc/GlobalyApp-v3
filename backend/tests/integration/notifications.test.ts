// Notifications: the per-user inbox, channel preferences, the push-token
// registry, and the fan-out worker.
//
// The worker's body is fanout(), called directly here — no broker, no process,
// no sleeping. Redelivery is simulated the way LavinMQ does it: hand the exact
// same message over a second time and assert nothing doubled.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("notifications", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, any>;
  let fanout: typeof import("../../src/modules/notifications/services/fanout.service.js")["fanout"];
  let publish: typeof import("../../src/modules/notifications/services/notifications.service.js")["publish"];

  let runId = "";
  let alice = 0;
  let bob = 0;
  let aliceToken = "";
  let bobToken = "";

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, any>;
    });
    ({ fanout } = await import("../../src/modules/notifications/services/fanout.service.js"));
    ({ publish } = await import("../../src/modules/notifications/services/notifications.service.js"));

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const notificationsModule = (await import("../../src/modules/notifications/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (protectedApp) => {
      await protectedApp.register(authPlugin);
      await protectedApp.register(notificationsModule);
    });
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({ first_name: "Notif", last_name: label, email: uniqueEmail(`notif.${label}`), account_status: 1 })
        .returning(["id"]);
      return row.id as number;
    };

    alice = await newUser("alice");
    bob = await newUser("bob");

    const sign = (id: number) =>
      jwt.sign(
        { sub: String(id), type: "platform_user", email: "notif@vitest.local" },
        config.JWT_SECRET as string,
      );
    aliceToken = sign(alice);
    bobToken = sign(bob);
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ─────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: (payload ?? {}) as object });
  const put = (url: string, token: string, payload: unknown) =>
    app.inject({ method: "PUT", url, headers: auth(token), payload: payload as object });
  const del = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "DELETE", url, headers: auth(token), payload: (payload ?? undefined) as object });

  let seq = 0;
  const message = (recipients: number[], overrides: Record<string, unknown> = {}) => {
    seq += 1;
    return {
      platform_user_ids: recipients,
      type: "event_registration_confirmed",
      title: `Message ${runId}-${seq}`,
      body: "You are on the list.",
      reference_type: "event",
      reference_id: "1",
      dedupe_key: `test:${runId}:${seq}`,
      ...overrides,
    };
  };

  const rowsFor = (userId: number, dedupeKey: string) =>
    masterKnex("notifications").where({ platform_user_id: userId, dedupe_key: dedupeKey });

  // ── fan-out ─────────────────────────────────────────────────────────────

  it("delivers a notification only to its intended recipient", async () => {
    const msg = message([alice]);
    await fanout(msg);

    expect(await rowsFor(alice, msg.dedupe_key)).toHaveLength(1);
    expect(await rowsFor(bob, msg.dedupe_key)).toHaveLength(0);

    const aliceInbox = await get("/api/v3/notifications", aliceToken);
    expect(aliceInbox.statusCode).toBe(200);
    expect(aliceInbox.json().data.some((n: { title: string }) => n.title === msg.title)).toBe(true);

    const bobInbox = await get("/api/v3/notifications", bobToken);
    expect(bobInbox.json().data.some((n: { title: string }) => n.title === msg.title)).toBe(false);
  });

  it("is idempotent over a re-delivered message", async () => {
    const msg = message([alice, bob]);

    const first = await fanout(msg);
    expect(first.notifications_created).toBe(2);

    // LavinMQ nacked and redelivered the identical message.
    const second = await fanout(msg);
    expect(second.notifications_created).toBe(0);
    expect(second.notifications_existing).toBe(2);

    for (const userId of [alice, bob]) {
      const rows = await rowsFor(userId, msg.dedupe_key);
      expect(rows).toHaveLength(1);

      // And nothing was dispatched twice either.
      const deliveries = await masterKnex("notification_deliveries").where({ notification_id: rows[0].id });
      expect(deliveries).toHaveLength(2); // in_app + email; push is opt-in
      expect(deliveries.filter((d) => d.channel === "in_app")).toHaveLength(1);
      // attempts counts dispatches that actually ran, so a second fan-out that
      // re-sent the email would show up here even though the row is unique.
      expect(deliveries.map((d) => d.attempts)).toEqual([1, 1]);
    }

    // A third delivery still changes nothing.
    const third = await fanout(msg);
    expect(third.notifications_created).toBe(0);
    expect(await rowsFor(alice, msg.dedupe_key)).toHaveLength(1);

    const [aliceRow] = await rowsFor(alice, msg.dedupe_key);
    const attempts = await masterKnex("notification_deliveries")
      .where({ notification_id: aliceRow.id })
      .pluck("attempts");
    expect(attempts).toEqual([1, 1]);
  });

  it("does not treat a repeated recipient id as a replay", async () => {
    const msg = message([alice, alice]);
    const result = await fanout(msg);
    expect(result.notifications_created).toBe(1);
    expect(result.notifications_existing).toBe(0);
  });

  it("honours a channel preference, and defaults push to off", async () => {
    const optOut = await put("/api/v3/notifications/preferences", aliceToken, {
      preferences: [
        { notification_type: "quiet_type", channel: "email", enabled: false },
        { notification_type: "quiet_type", channel: "push", enabled: true },
      ],
    });
    expect(optOut.statusCode).toBe(200);

    const msg = message([alice], { type: "quiet_type" });
    await fanout(msg);
    const [row] = await rowsFor(alice, msg.dedupe_key);
    const channels = (await masterKnex("notification_deliveries").where({ notification_id: row.id }))
      .map((d) => d.channel)
      .sort();
    // email opted out, push opted in — so in_app + push, no email.
    expect(channels).toEqual(["in_app", "push"]);

    // Push has no provider on this deployment: skipped, never a pretend send.
    const push = await masterKnex("notification_deliveries")
      .where({ notification_id: row.id, channel: "push" })
      .first();
    expect(push.status).toBe("skipped");
    expect(push.sent_at).toBeNull();
  });

  it("rejects a malformed fan-out message rather than writing a partial row", async () => {
    await expect(fanout({ platform_user_ids: [], type: "x", title: "y", dedupe_key: "z" })).rejects.toThrow();
  });

  it("never fails the caller's request when the broker is unreachable", async () => {
    // LAVINMQ_URL points at a dead port in the test env, so this exercises the
    // real failure path: publish() logs and returns false, it does not throw.
    await expect(publish(message([alice]))).resolves.toBe(false);
  });

  // ── inbox ───────────────────────────────────────────────────────────────

  it("counts, reads and deletes only the caller's own notifications", async () => {
    const msg = message([alice]);
    await fanout(msg);
    const [row] = await rowsFor(alice, msg.dedupe_key);

    const before = await get("/api/v3/notifications/unread-count", aliceToken);
    expect(before.json().unread).toBeGreaterThan(0);

    // Bob cannot read or delete Alice's notification.
    expect((await post(`/api/v3/notifications/${row.id}/read`, bobToken)).statusCode).toBe(404);
    expect((await del(`/api/v3/notifications/${row.id}`, bobToken)).statusCode).toBe(404);

    expect((await post(`/api/v3/notifications/${row.id}/read`, aliceToken)).statusCode).toBe(204);
    const readBack = await masterKnex("notifications").where({ id: row.id }).first();
    expect(readBack.read_at).not.toBeNull();

    expect((await del(`/api/v3/notifications/${row.id}`, aliceToken)).statusCode).toBe(204);
    const gone = await get("/api/v3/notifications", aliceToken);
    expect(gone.json().data.some((n: { id: number }) => n.id === row.id)).toBe(false);
  });

  it("marks everything read at once and filters to unread", async () => {
    await fanout(message([bob]));
    await fanout(message([bob]));

    const unread = await get("/api/v3/notifications?unread=true", bobToken);
    expect(unread.json().data.length).toBeGreaterThan(0);

    const cleared = await post("/api/v3/notifications/read-all", bobToken);
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().updated).toBeGreaterThan(0);

    expect((await get("/api/v3/notifications/unread-count", bobToken)).json().unread).toBe(0);
    expect((await get("/api/v3/notifications?unread=true", bobToken)).json().data).toHaveLength(0);
  });

  it("requires a token for every route", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v3/notifications" });
    expect(res.statusCode).toBe(401);
  });

  // ── push tokens (V2 design) ─────────────────────────────────────────────

  it("moves a device token to the user who registered it last", async () => {
    const token = `fcm_${runId}_shared_device`;

    expect((await post("/api/v3/notifications/push-tokens", aliceToken, { token })).statusCode).toBe(200);
    let rows = await masterKnex("push_tokens").where({ token });
    expect(rows).toHaveLength(1);
    expect(rows[0].platform_user_id).toBe(alice);

    // Same physical device, different person signs in. FCM tokens are
    // device-scoped, so the row must move rather than duplicate.
    expect((await post("/api/v3/notifications/push-tokens", bobToken, { token })).statusCode).toBe(200);
    rows = await masterKnex("push_tokens").where({ token });
    expect(rows).toHaveLength(1);
    expect(rows[0].platform_user_id).toBe(bob);

    // Alice can no longer unregister it; Bob can.
    expect((await del("/api/v3/notifications/push-tokens", aliceToken, { token })).json().deleted).toBe(false);
    expect((await del("/api/v3/notifications/push-tokens", bobToken, { token })).json().deleted).toBe(true);
  });

  it("returns the caller's preferences with the available channels", async () => {
    const res = await get("/api/v3/notifications/preferences", aliceToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().channels).toEqual(["in_app", "email", "push"]);
    expect(Array.isArray(res.json().preferences)).toBe(true);
  });
});

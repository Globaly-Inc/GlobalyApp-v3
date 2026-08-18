// Messaging (D2) — conversations, participants, messages, read state, SSE.
//
// Everything lives in master (public): a conversation joins a student to one or more
// businesses, so no single tenant schema can hold it. Fixtures build two real businesses
// with provisioned tenant schemas because the invite route checks team membership against
// the caller's tenant `agents` table.
//
// The SSE cases need a real socket, so the app also listens on an ephemeral port —
// app.inject() buffers the whole response and would never see a frame.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const BASE = "/api/v3/messaging";

interface SseHandle {
  events: { event: string; data: any }[];
  close: () => void;
  waitFor: (predicate: () => boolean, timeoutMs?: number) => Promise<void>;
  status: number;
}

describeDb("messaging", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let origin = "";
  let streamCount: () => number;

  let studentId = 0;
  let agentId = 0;
  let mateId = 0; // team member of business A, not yet in the conversation
  let outsiderId = 0;

  let bizA = 0;
  let schemaA = "";
  let schemaB = "";
  let schemaInst = "";

  let studentToken = "";
  let agentToken = ""; // business A context
  let agentNoOrgToken = "";
  let mateToken = "";
  let outsiderToken = ""; // business B context
  let instToken = ""; // `mate`, switched to an institution-typed business
  let conversationId = 0;

  // ── helpers ──

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload: unknown = {}) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: payload as object });

  /** Opens a real SSE connection and collects frames until close(). */
  async function openStream(convId: number, token: string, sinceId?: number): Promise<SseHandle> {
    const controller = new AbortController();
    const qs = sinceId === undefined ? "" : `?since_id=${sinceId}`;
    const res = await fetch(`${origin}${BASE}/conversations/${convId}/stream${qs}`, {
      headers: auth(token),
      signal: controller.signal,
    });
    const handle: SseHandle = {
      events: [],
      status: res.status,
      close: () => controller.abort(),
      waitFor: async (predicate, timeoutMs = 8000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (predicate()) return;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error("timed out waiting for SSE condition");
      },
    };
    if (!res.ok || !res.body) return handle;

    // Drain in the background; abort() ends the loop.
    void (async () => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue; // comment frame (heartbeat)
            handle.events.push({
              event: eventLine.slice(6).trim(),
              data: JSON.parse(dataLine.slice(5).trim()),
            });
          }
        }
      } catch {
        // aborted — expected on close()
      }
    })();
    return handle;
  }

  async function sendAs(token: string, content: string) {
    const res = await post(`${BASE}/conversations/${conversationId}/messages`, token, { content });
    expect(res.statusCode).toBe(201);
    return res.json().message as { id: number; created_at: string };
  }

  async function unreadFor(token: string): Promise<number> {
    const res = await get(`${BASE}/conversations?limit=50`, token);
    expect(res.statusCode).toBe(200);
    const row = res.json().data.find((c: any) => c.id === conversationId);
    return row.unread_count as number;
  }

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as { config: Record<string, string> };
    const { provisionBusinessSchema } = await import("../../src/core/business/provisioner.js");
    const { createSchemaKnex, schemaName } = await import("../../src/core/db/knex.js");
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const messagingModule = (await import("../../src/modules/messaging/index.js")).default;
    ({ activeStreamCount: streamCount } = await import("../../src/modules/messaging/services/stream.service.js"));

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scope) => {
      await scope.register(authPlugin);
      await scope.register(tenantPlugin);
      await scope.register(messagingModule);
    });
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    origin = typeof address === "string" ? address : `http://127.0.0.1:${address!.port}`;

    // ── fixtures ──
    const suffix = `${process.pid}${Date.now() % 1_000_000}`;

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Msg",
          last_name: label,
          email: uniqueEmail(`msg.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return row.id as number;
    };
    studentId = await newUser("student");
    agentId = await newUser("agent");
    mateId = await newUser("mate");
    outsiderId = await newUser("outsider");

    const insertBusiness = async (label: string, ownerId: number, type: string | null) => {
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: ownerId,
          subdomain: `msg-${label}-${suffix}`,
          business_name: `Msg ${label} ${suffix}`,
          business_type: type,
          account_status: 1,
          status: "active",
        })
        .returning(["id", "schema_name"]);
      await provisionBusinessSchema(row.schema_name);
      return row;
    };

    const a = await insertBusiness("a", agentId, "agency");
    const b = await insertBusiness("b", outsiderId, "agency");
    // V1 seated an institution's staff as provider_member instead of agent_member.
    const c = await insertBusiness("c", mateId, "institution");
    bizA = a.id;
    schemaA = a.schema_name;
    schemaB = b.schema_name;
    schemaInst = c.schema_name;

    // Seat the agent and one team mate in business A's tenant schema.
    const tenantA = createSchemaKnex(schemaName(schemaA), { min: 0, max: 1 });
    try {
      const role = await tenantA("roles").first("id");
      await tenantA("agents").insert([
        { platform_user_id: agentId, role_id: role.id, is_owner: true },
        { platform_user_id: mateId, role_id: role.id },
      ]);
    } finally {
      await tenantA.destroy();
    }

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "messaging@vitest.local", ...claims }, config.JWT_SECRET);
    studentToken = sign({ sub: String(studentId), type: "platform_user" });
    agentToken = sign({ sub: String(agentId), type: "platform_user", orgId: schemaA });
    agentNoOrgToken = sign({ sub: String(agentId), type: "platform_user" });
    mateToken = sign({ sub: String(mateId), type: "platform_user", orgId: schemaA });
    outsiderToken = sign({ sub: String(outsiderId), type: "platform_user", orgId: schemaB });
    instToken = sign({ sub: String(mateId), type: "platform_user", orgId: schemaInst });

    const tenantInst = createSchemaKnex(schemaName(schemaInst), { min: 0, max: 1 });
    try {
      const role = await tenantInst("roles").first("id");
      await tenantInst("agents").insert({ platform_user_id: mateId, role_id: role.id, is_owner: true });
    } finally {
      await tenantInst.destroy();
    }
  });

  afterAll(async () => {
    if (masterKnex) {
      await masterKnex("conversations").whereIn("created_by", [studentId, agentId, mateId, outsiderId]).del();
      await masterKnex("businesses").whereIn("owner_id", [agentId, mateId, outsiderId]).del();
      await masterKnex("platform_users").whereIn("id", [studentId, agentId, mateId, outsiderId]).del();
    }
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── starting a conversation (V1 start-chat is the behavioural spec) ────────

  it("starts a conversation from a business, seating the caller and the student", async () => {
    const res = await post(`${BASE}/conversations`, agentToken, {
      student_user_id: studentId,
      enquiry_id: 4242,
      title: "Enquiry Chat",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.existing).toBe(false);
    conversationId = body.conversation_id;

    const participants = await masterKnex("conversation_participants")
      .where({ conversation_id: conversationId })
      .orderBy("role");
    expect(participants.map((p) => p.role)).toEqual(["agent_member", "student"]);
    expect(participants.find((p) => p.role === "agent_member")!.business_id).toBe(bizA);
    expect(participants.find((p) => p.role === "student")!.business_id).toBeNull();

    // V1 inserted a "Conversation started" system message.
    const messages = await masterKnex("conversation_messages").where({ conversation_id: conversationId });
    expect(messages).toHaveLength(1);
  });

  it("returns the existing conversation for an enquiry instead of creating a second", async () => {
    const res = await post(`${BASE}/conversations`, agentToken, { student_user_id: studentId, enquiry_id: 4242 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ conversation_id: conversationId, existing: true });
  });

  it("refuses to start a conversation without business context", async () => {
    const res = await post(`${BASE}/conversations`, agentNoOrgToken, { student_user_id: studentId });
    expect(res.statusCode).toBe(403);
  });

  it("seats an institution's staff as provider_member", async () => {
    const res = await post(`${BASE}/conversations`, instToken, { student_user_id: studentId });
    expect(res.statusCode).toBe(201);
    const seats = await masterKnex("conversation_participants")
      .where({ conversation_id: res.json().conversation_id })
      .orderBy("role");
    expect(seats.map((p) => p.role)).toEqual(["provider_member", "student"]);
  });

  it("refuses a conversation with only one person in it", async () => {
    const res = await post(`${BASE}/conversations`, agentToken, { student_user_id: agentId });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown student", async () => {
    const res = await post(`${BASE}/conversations`, agentToken, { student_user_id: 99_999_999 });
    expect(res.statusCode).toBe(404);
  });

  // ── visibility ────────────────────────────────────────────────────────────

  it("lists a conversation for its participants only", async () => {
    for (const token of [studentToken, agentToken]) {
      const res = await get(`${BASE}/conversations`, token);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.map((c: any) => c.id)).toContain(conversationId);
    }
    const outsider = await get(`${BASE}/conversations`, outsiderToken);
    expect(outsider.statusCode).toBe(200);
    expect(outsider.json().data.map((c: any) => c.id)).not.toContain(conversationId);
  });

  it("gives a non-participant 404 on every conversation-scoped route", async () => {
    const cases: [string, () => Promise<{ statusCode: number }>][] = [
      ["GET detail", () => get(`${BASE}/conversations/${conversationId}`, outsiderToken)],
      ["POST message", () => post(`${BASE}/conversations/${conversationId}/messages`, outsiderToken, { content: "hi" })],
      [
        "POST participant",
        () => post(`${BASE}/conversations/${conversationId}/participants`, outsiderToken, { invitee_user_id: mateId }),
      ],
      ["POST read", () => post(`${BASE}/conversations/${conversationId}/read`, outsiderToken)],
    ];
    for (const [label, run] of cases) {
      const res = await run();
      expect(res.statusCode, label).toBe(404);
    }
    // The stream route must fail the same way, as JSON, before it hijacks the socket.
    const stream = await openStream(conversationId, outsiderToken);
    expect(stream.status).toBe(404);
    stream.close();
  });

  // ── history ───────────────────────────────────────────────────────────────

  it("returns the conversation with participants and a page of history", async () => {
    await sendAs(studentToken, "first from student");
    const res = await get(`${BASE}/conversations/${conversationId}?limit=10`, studentToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversation.id).toBe(conversationId);
    expect(body.participants).toHaveLength(2);
    expect(body.messages.data[0].content).toBe("first from student");
    expect(body.messages.meta.anchor_id).toBe(body.messages.data[0].id);
  });

  it("keeps page edges stable while new messages arrive", async () => {
    for (let i = 0; i < 24; i += 1) await sendAs(agentToken, `bulk ${i}`);

    const first = await get(`${BASE}/conversations/${conversationId}?page=1&limit=10`, studentToken);
    const anchor = first.json().messages.meta.anchor_id;
    const firstIds = first.json().messages.data.map((m: any) => m.id);

    // Concurrent inserts land ABOVE the anchor, so they must not shift page 2.
    await sendAs(studentToken, "interleaved a");
    await sendAs(studentToken, "interleaved b");

    const second = await get(
      `${BASE}/conversations/${conversationId}?page=2&limit=10&anchor_id=${anchor}`,
      studentToken,
    );
    const secondIds = second.json().messages.data.map((m: any) => m.id);
    expect(secondIds).toHaveLength(10);
    expect(secondIds.filter((id: number) => firstIds.includes(id))).toEqual([]);
    // Newest-first and contiguous across the edge.
    expect(Math.max(...secondIds)).toBeLessThan(Math.min(...firstIds));
    expect(secondIds).toEqual([...secondIds].sort((a: number, b: number) => b - a));
  });

  it("orders messages deterministically when several share a timestamp", async () => {
    const rows = await masterKnex("conversation_messages")
      .insert(
        [1, 2, 3, 4, 5].map((n) => ({
          conversation_id: conversationId,
          sender_id: agentId,
          content: `same-ms ${n}`,
        })),
      )
      .returning(["id", "created_at"]);
    // One statement → one transaction timestamp → identical created_at for all five.
    expect(new Set(rows.map((r) => String(r.created_at))).size).toBe(1);

    const res = await get(`${BASE}/conversations/${conversationId}?limit=5`, studentToken);
    const ids = res.json().messages.data.map((m: any) => m.id);
    expect(ids).toEqual([...rows.map((r) => r.id)].sort((a, b) => b - a));
  });

  // ── unread counts ─────────────────────────────────────────────────────────

  it("counts unread messages from others and clears them on read", async () => {
    const before = await unreadFor(agentToken);
    await sendAs(studentToken, "unread one");
    await sendAs(studentToken, "unread two");
    expect(await unreadFor(agentToken)).toBe(before + 2);

    const read = await post(`${BASE}/conversations/${conversationId}/read`, agentToken);
    expect(read.statusCode).toBe(200);
    expect(read.json().unread_count).toBe(0);
    expect(await unreadFor(agentToken)).toBe(0);

    // The agent's own message never counts against the agent.
    await sendAs(agentToken, "my own");
    expect(await unreadFor(agentToken)).toBe(0);

    // …but it does for the student.
    const studentUnread = await unreadFor(studentToken);
    expect(studentUnread).toBeGreaterThan(0);
    await post(`${BASE}/conversations/${conversationId}/read`, studentToken);
    expect(await unreadFor(studentToken)).toBe(0);
  });

  // ── message bodies ────────────────────────────────────────────────────────

  it("accepts a file message with no text", async () => {
    const res = await post(`${BASE}/conversations/${conversationId}/messages`, studentToken, {
      message_type: "file",
      file_url: "https://storage.test/offer.pdf",
      file_name: "offer.pdf",
      file_size: 1024,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message).toMatchObject({
      content: null,
      message_type: "file",
      file_name: "offer.pdf",
      file_size: 1024,
    });
  });

  it("rejects a message with neither text nor a file", async () => {
    const res = await post(`${BASE}/conversations/${conversationId}/messages`, studentToken, { content: "   " });
    expect(res.statusCode).toBe(400);
  });

  it("marks a conversation with no messages as read without inventing a watermark", async () => {
    const [empty] = await masterKnex("conversations")
      .insert({ title: "Empty", created_by: studentId })
      .returning(["id"]);
    await masterKnex("conversation_participants").insert({
      conversation_id: empty.id,
      platform_user_id: studentId,
      role: "student",
      business_id: null,
    });
    const res = await post(`${BASE}/conversations/${empty.id}/read`, studentToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ last_read_message_id: null, unread_count: 0 });
  });

  it("refuses to send into a closed conversation", async () => {
    const [closed] = await masterKnex("conversations")
      .insert({ title: "Closed", created_by: studentId, status: "closed" })
      .returning(["id"]);
    await masterKnex("conversation_participants").insert({
      conversation_id: closed.id,
      platform_user_id: studentId,
      role: "student",
      business_id: null,
    });
    const res = await post(`${BASE}/conversations/${closed.id}/messages`, studentToken, { content: "still here?" });
    expect(res.statusCode).toBe(409);
  });

  // ── invite (V1 invite-chat-participant is the behavioural spec) ────────────

  it("invites a team member of the caller's business", async () => {
    const res = await post(`${BASE}/conversations/${conversationId}/participants`, agentToken, {
      invitee_user_id: mateId,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().participant).toMatchObject({
      platform_user_id: mateId,
      role: "agent_member",
      business_id: bizA,
      is_active: true,
    });

    const seen = await get(`${BASE}/conversations`, mateToken);
    expect(seen.json().data.map((c: any) => c.id)).toContain(conversationId);
  });

  it("rejects inviting the same active participant twice", async () => {
    const res = await post(`${BASE}/conversations/${conversationId}/participants`, agentToken, {
      invitee_user_id: mateId,
    });
    expect(res.statusCode).toBe(409);
  });

  it("re-activates a participant who had left", async () => {
    await masterKnex("conversation_participants")
      .where({ conversation_id: conversationId, platform_user_id: mateId })
      .update({ is_active: false, left_at: masterKnex.fn.now() });

    const res = await post(`${BASE}/conversations/${conversationId}/participants`, agentToken, {
      invitee_user_id: mateId,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().participant).toMatchObject({ is_active: true, left_at: null });
  });

  it("rejects an invitee who is not a team member of the caller's business", async () => {
    const res = await post(`${BASE}/conversations/${conversationId}/participants`, agentToken, {
      invitee_user_id: studentId,
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to invite while switched to a different business than the one in the thread", async () => {
    // `mate` sits in this conversation on business A's behalf, but is calling from the
    // institution's context — the seat and the context must agree.
    const res = await post(`${BASE}/conversations/${conversationId}/participants`, instToken, {
      invitee_user_id: agentId,
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses to let a student invite anyone", async () => {
    const res = await post(`${BASE}/conversations/${conversationId}/participants`, studentToken, {
      invitee_user_id: mateId,
    });
    // No business context at all — the guard fires before the participant lookup.
    expect(res.statusCode).toBe(403);
  });

  // ── SSE ───────────────────────────────────────────────────────────────────

  it("streams a new message to a connected participant", async () => {
    const stream = await openStream(conversationId, studentToken);
    expect(stream.status).toBe(200);
    try {
      const sent = await sendAs(agentToken, "hello over the wire");
      await stream.waitFor(() => stream.events.some((e) => e.data.id === sent.id));
      const frame = stream.events.find((e) => e.data.id === sent.id)!;
      expect(frame.event).toBe("message");
      expect(frame.data.content).toBe("hello over the wire");
      expect(frame.data.sender_name).toContain("Msg");
    } finally {
      stream.close();
    }
  });

  it("replays only messages after since_id", async () => {
    const marker = await sendAs(agentToken, "before the cursor");
    const after = await sendAs(agentToken, "after the cursor");
    const stream = await openStream(conversationId, studentToken, marker.id);
    try {
      await stream.waitFor(() => stream.events.some((e) => e.data.id === after.id));
      expect(stream.events.some((e) => e.data.id === marker.id)).toBe(false);
    } finally {
      stream.close();
    }
  });

  it("never streams a conversation to a non-participant", async () => {
    const outsiderStream = await openStream(conversationId, outsiderToken);
    const participantStream = await openStream(conversationId, studentToken);
    try {
      expect(outsiderStream.status).toBe(404);
      const sent = await sendAs(agentToken, "participants only");
      await participantStream.waitFor(() => participantStream.events.some((e) => e.data.id === sent.id));
      expect(outsiderStream.events).toEqual([]);
    } finally {
      outsiderStream.close();
      participantStream.close();
    }
  });

  it("cleans up every stream listener on disconnect", async () => {
    const until = async (predicate: () => boolean) => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 50));
      return predicate();
    };

    // Every stream opened by the preceding cases must already be gone — that is the
    // "no leak across a test run" half of the assertion.
    expect(await until(() => streamCount() === 0)).toBe(true);

    const streams = await Promise.all([
      openStream(conversationId, studentToken),
      openStream(conversationId, agentToken),
      openStream(conversationId, mateToken),
    ]);
    expect(await until(() => streamCount() === 3)).toBe(true);
    for (const s of streams) s.close();
    expect(await until(() => streamCount() === 0)).toBe(true);
  });
});

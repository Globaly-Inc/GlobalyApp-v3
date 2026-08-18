// Feed comments (D4) — list / add / edit / soft-delete / moderate.
//
// Everything lives in master (public): a post authored by one business's member is
// commented on by students and by members of other businesses, so no single tenant
// schema can hold the graph.
//
// The load-bearing cases are the authorisation ones (a non-author can neither edit
// nor delete), the soft-delete invisibility one, and the pagination-stability one —
// a comment inserted mid-pagination must neither duplicate nor skip a row.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const BASE = "/api/v3/feed";

describeDb("feed comments", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;

  let authorId = 0;
  let otherId = 0;
  let authorToken = "";
  let otherToken = "";
  let adminToken = "";

  let postId = 0;
  let privatePostId = 0;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload: unknown = {}) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: payload as object });
  const patch = (url: string, token: string, payload: unknown = {}) =>
    app.inject({ method: "PATCH", url, headers: auth(token), payload: payload as object });
  const del = (url: string, token: string) => app.inject({ method: "DELETE", url, headers: auth(token) });

  async function addComment(token: string, content: string, parent?: number) {
    const res = await post(`${BASE}/posts/${postId}/comments`, token, {
      content,
      ...(parent ? { parent_comment_id: parent } : {}),
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: number; content: string; created_at: string };
  }

  async function commentCount(): Promise<number> {
    const row = await masterKnex("feed_posts").where({ id: postId }).first("comments_count");
    return Number(row!.comments_count);
  }

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as { config: Record<string, string> };
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const feedModule = (await import("../../src/modules/feed/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scope) => {
      await scope.register(authPlugin);
      await scope.register(feedModule);
    });
    await app.ready();

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({ first_name: "Cmt", last_name: label, email: uniqueEmail(`cmt.${label}`), account_status: 1 })
        .returning(["id"]);
      return row.id as number;
    };
    authorId = await newUser("author");
    otherId = await newUser("other");

    const insertPost = async (visibility: string) => {
      const [row] = await masterKnex("feed_posts")
        .insert({
          author_platform_user_id: authorId,
          post_type: "social",
          visibility,
          content: `post ${visibility}`,
          media: JSON.stringify([]),
        })
        .returning(["id"]);
      return row.id as number;
    };
    postId = await insertPost("everyone");
    privatePostId = await insertPost("private");

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "feed-comments@vitest.local", ...claims }, config.JWT_SECRET);
    authorToken = sign({ sub: String(authorId), type: "platform_user" });
    otherToken = sign({ sub: String(otherId), type: "platform_user" });
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });
  });

  afterAll(async () => {
    if (masterKnex) {
      await masterKnex("feed_posts").whereIn("id", [postId, privatePostId]).del();
      await masterKnex("platform_users").whereIn("id", [authorId, otherId]).del();
    }
    if (shutdownPools) await shutdownPools();
  });

  it("adds a comment, hydrates the author card, and counts it on the post", async () => {
    const before = await commentCount();
    const res = await post(`${BASE}/posts/${postId}/comments`, otherToken, { content: "first!" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.content).toBe("first!");
    expect(body.author_platform_user_id).toBe(otherId);
    expect(body.author_first_name).toBe("Cmt");
    expect(body.is_mine).toBe(true);
    expect(body.parent_comment_id).toBeNull();
    expect(await commentCount()).toBe(before + 1);
  });

  it("rejects an empty comment", async () => {
    const res = await post(`${BASE}/posts/${postId}/comments`, otherToken, { content: "   " });
    expect(res.statusCode).toBe(400);
  });

  it("never honours a client-supplied author", async () => {
    const res = await post(`${BASE}/posts/${postId}/comments`, otherToken, {
      content: "spoof",
      author_platform_user_id: authorId,
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s for a post that does not exist", async () => {
    const res = await post(`${BASE}/posts/99999999/comments`, otherToken, { content: "ghost" });
    expect(res.statusCode).toBe(404);
  });

  it("404s when commenting on someone else's private post", async () => {
    const res = await post(`${BASE}/posts/${privatePostId}/comments`, otherToken, { content: "peek" });
    expect(res.statusCode).toBe(404);
  });

  it("lists comments oldest-first with the viewer's own flag", async () => {
    const created = await addComment(authorToken, "by the author");
    const res = await get(`${BASE}/posts/${postId}/comments?limit=50`, otherToken);
    expect(res.statusCode).toBe(200);
    const { comments } = res.json();
    const mine = comments.find((c: any) => c.id === created.id);
    expect(mine.is_mine).toBe(false);
    // ascending by created_at
    const ids = comments.map((c: any) => c.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it("carries parent_comment_id through unchanged", async () => {
    const parent = await addComment(authorToken, "parent");
    const reply = await addComment(otherToken, "reply", parent.id);
    const res = await get(`${BASE}/posts/${postId}/comments?limit=50`, otherToken);
    const found = res.json().comments.find((c: any) => c.id === reply.id);
    expect(found.parent_comment_id).toBe(parent.id);
  });

  it("lets the author edit their own comment", async () => {
    const created = await addComment(otherToken, "typo");
    const res = await patch(`${BASE}/comments/${created.id}`, otherToken, { content: "fixed" });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe("fixed");
  });

  it("refuses to let a non-author edit someone else's comment", async () => {
    const created = await addComment(otherToken, "not yours");
    const res = await patch(`${BASE}/comments/${created.id}`, authorToken, { content: "hijacked" });
    expect(res.statusCode).toBe(403);
    const row = await masterKnex("feed_comments").where({ id: created.id }).first("content");
    expect(row!.content).toBe("not yours");
  });

  it("refuses to let a non-author delete someone else's comment", async () => {
    const created = await addComment(otherToken, "mine alone");
    const res = await del(`${BASE}/comments/${created.id}`, authorToken);
    expect(res.statusCode).toBe(403);
    const row = await masterKnex("feed_comments").where({ id: created.id }).first("deleted_at");
    expect(row!.deleted_at).toBeNull();
  });

  it("soft-deletes the caller's own comment, decrements the count, and hides it from reads", async () => {
    const created = await addComment(otherToken, "to be deleted");
    const before = await commentCount();

    const res = await del(`${BASE}/comments/${created.id}`, otherToken);
    expect(res.statusCode).toBe(204);
    expect(await commentCount()).toBe(before - 1);

    const row = await masterKnex("feed_comments").where({ id: created.id }).first("deleted_at");
    expect(row!.deleted_at).not.toBeNull();

    const list = await get(`${BASE}/posts/${postId}/comments?limit=100`, otherToken);
    expect(list.json().comments.map((c: any) => c.id)).not.toContain(created.id);
  });

  it("is idempotent on a second delete of the same comment", async () => {
    const created = await addComment(otherToken, "double delete");
    expect((await del(`${BASE}/comments/${created.id}`, otherToken)).statusCode).toBe(204);
    const count = await commentCount();
    expect((await del(`${BASE}/comments/${created.id}`, otherToken)).statusCode).toBe(404);
    expect(await commentCount()).toBe(count);
  });

  it("refuses to edit a soft-deleted comment", async () => {
    const created = await addComment(otherToken, "gone");
    await del(`${BASE}/comments/${created.id}`, otherToken);
    const res = await patch(`${BASE}/comments/${created.id}`, otherToken, { content: "back" });
    expect(res.statusCode).toBe(404);
  });

  it("lets an admin moderate away someone else's comment", async () => {
    const created = await addComment(otherToken, "moderate me");
    const before = await commentCount();
    const res = await del(`${BASE}/comments/${created.id}`, adminToken);
    expect(res.statusCode).toBe(204);
    expect(await commentCount()).toBe(before - 1);
  });

  it("pages by keyset, stable when a comment is inserted mid-pagination", async () => {
    // Fresh post so the page contents are fully controlled.
    const [row] = await masterKnex("feed_posts")
      .insert({
        author_platform_user_id: authorId,
        post_type: "social",
        visibility: "everyone",
        content: "pagination",
        media: JSON.stringify([]),
      })
      .returning(["id"]);
    const pagedPost = row.id as number;

    const made: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await post(`${BASE}/posts/${pagedPost}/comments`, otherToken, { content: `c${i}` });
      made.push(res.json().id);
    }

    const first = await get(`${BASE}/posts/${pagedPost}/comments?limit=2`, otherToken);
    const page1 = first.json();
    expect(page1.comments.map((c: any) => c.id)).toEqual(made.slice(0, 2));
    expect(page1.next_cursor).toBeTruthy();

    // A new comment appended between pages must not shift or duplicate anything.
    const injected = await post(`${BASE}/posts/${pagedPost}/comments`, authorToken, { content: "injected" });
    made.push(injected.json().id);

    const seen = [...page1.comments.map((c: any) => c.id)];
    let cursor: string | null = page1.next_cursor;
    while (cursor) {
      const res = await get(
        `${BASE}/posts/${pagedPost}/comments?limit=2&cursor=${encodeURIComponent(cursor)}`,
        otherToken,
      );
      const page = res.json();
      seen.push(...page.comments.map((c: any) => c.id));
      cursor = page.next_cursor;
    }

    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect(seen).toEqual(made); // no skips, ordering preserved

    await masterKnex("feed_posts").where({ id: pagedPost }).del();
  });

  it("rejects a malformed cursor rather than silently returning page one", async () => {
    const res = await get(`${BASE}/posts/${postId}/comments?cursor=not-a-cursor`, otherToken);
    expect(res.statusCode).toBe(400);
  });

  it("requires a token", async () => {
    const res = await app.inject({ method: "GET", url: `${BASE}/posts/${postId}/comments` });
    expect(res.statusCode).toBe(401);
  });
});

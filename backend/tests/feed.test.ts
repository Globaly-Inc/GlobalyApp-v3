import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getApp, closeApp, resetDb, createUser, createBusiness, addMembership, createPost, auth, masterKnex,
} from "./helpers.js";

before(async () => {
  await getApp();
});
after(closeApp);
beforeEach(resetDb);

// 3. Ownership.
test("a post can only be deleted by its author, and the author comes from the JWT", async () => {
  const app = await getApp();
  const author = await createUser();
  const other = await createUser();

  const created = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(author.id, author.email),
    // A forged author id must be ignored (the schema is strict, so it is rejected outright).
    payload: { content: "mine" },
  });
  assert.equal(created.statusCode, 201);
  const postId = created.json().id;
  assert.equal(created.json().author_platform_user_id, author.id);

  const forbidden = await app.inject({
    method: "DELETE", url: `/api/v3/feed/posts/${postId}`,
    headers: auth(other.id, other.email),
  });
  assert.equal(forbidden.statusCode, 403);

  const allowed = await app.inject({
    method: "DELETE", url: `/api/v3/feed/posts/${postId}`,
    headers: auth(author.id, author.email),
  });
  assert.equal(allowed.statusCode, 204);
});

test("a forged author_platform_user_id is rejected, never honoured", async () => {
  const app = await getApp();
  const author = await createUser();
  const victim = await createUser();

  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(author.id, author.email),
    payload: { content: "spoofed", author_platform_user_id: victim.id },
  });
  assert.equal(res.statusCode, 400);
  const count = await masterKnex("feed_posts").where({ author_platform_user_id: victim.id }).count();
  assert.equal(Number(count[0].count), 0);
});

// 4. Visibility — the WHERE clause is the only guard, so each case is tested explicitly.
test("visibility: everyone / private / business are enforced server-side", async () => {
  const app = await getApp();
  const author = await createUser();
  const member = await createUser();
  const stranger = await createUser();
  const business = await createBusiness();
  await addMembership(author.id, business.id);
  await addMembership(member.id, business.id);

  await createPost(author.id, { content: "public", visibility: "everyone" });
  await createPost(author.id, { content: "secret", visibility: "private" });
  await createPost(author.id, { content: "internal", visibility: "business", business_id: business.id });

  const contentsFor = async (userId: number, email: string) => {
    const res = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(userId, email) });
    assert.equal(res.statusCode, 200);
    return res.json().posts.map((p: { content: string }) => p.content);
  };

  const authorSees = await contentsFor(author.id, author.email);
  assert.deepEqual(authorSees.sort(), ["internal", "public", "secret"]);

  const memberSees = await contentsFor(member.id, member.email);
  assert.deepEqual(memberSees.sort(), ["internal", "public"]);

  const strangerSees = await contentsFor(stranger.id, stranger.email);
  assert.deepEqual(strangerSees, ["public"]);
});

test("a business-visible post with no business_id is rejected at write", async () => {
  const app = await getApp();
  const user = await createUser();
  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: { content: "nowhere", visibility: "business" },
  });
  assert.equal(res.statusCode, 400);
});

test("posting to a business you are not a member of is forbidden", async () => {
  const app = await getApp();
  const outsider = await createUser();
  const business = await createBusiness();
  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(outsider.id, outsider.email),
    payload: { content: "hello", visibility: "business", business_id: business.id },
  });
  assert.equal(res.statusCode, 403);
});

// 5. Cursor pagination — every row exactly once, stable under insertion.
test("paging the feed yields every post exactly once", async () => {
  const app = await getApp();
  const user = await createUser();
  for (let i = 0; i < 7; i++) await createPost(user.id, { content: `post-${i}` });

  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = `/api/v3/feed/posts?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await app.inject({ method: "GET", url, headers: auth(user.id, user.email) });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    seen.push(...body.posts.map((p: { content: string }) => p.content));
    cursor = body.next_cursor;
    if (!cursor) break;
  }

  assert.equal(seen.length, 7, "every post exactly once");
  assert.equal(new Set(seen).size, 7, "no duplicates");
});

test("a post inserted mid-pagination neither duplicates nor skips a row", async () => {
  const app = await getApp();
  const user = await createUser();
  for (let i = 0; i < 4; i++) await createPost(user.id, { content: `original-${i}` });

  const first = await app.inject({
    method: "GET", url: "/api/v3/feed/posts?limit=2", headers: auth(user.id, user.email),
  });
  const firstPage = first.json();

  // A newer post sorts above the cursor, so keyset pagination simply never reaches it — the important
  // property is that nothing already-seen repeats and nothing older is skipped.
  await createPost(user.id, { content: "inserted-midway" });

  const second = await app.inject({
    method: "GET",
    url: `/api/v3/feed/posts?limit=2&cursor=${encodeURIComponent(firstPage.next_cursor)}`,
    headers: auth(user.id, user.email),
  });
  const secondPage = second.json();

  const firstContents = firstPage.posts.map((p: { content: string }) => p.content);
  const secondContents = secondPage.posts.map((p: { content: string }) => p.content);
  assert.equal(firstContents.filter((c: string) => secondContents.includes(c)).length, 0, "no duplicates across pages");
  assert.deepEqual([...firstContents, ...secondContents].sort(), [
    "original-0", "original-1", "original-2", "original-3",
  ]);
});

/**
 * Posts sharing one millisecond are the case that breaks a cursor built from a JS Date: `toISOString()`
 * truncates to milliseconds, Postgres keeps microseconds, and the truncated value lands at or ahead of a row
 * that should still follow it — so that row is skipped on every page and vanishes from the feed.
 */
test("paging is exact when posts share the same millisecond", async () => {
  const app = await getApp();
  const user = await createUser();

  // Identical created_at to the millisecond, distinct microseconds — exactly the ambiguous case.
  const base = "2026-08-11 10:00:00.123";
  for (const micros of ["100", "200", "300", "400", "500"]) {
    await masterKnex("feed_posts").insert({
      author_platform_user_id: user.id,
      content: `us-${micros}`,
      post_type: "social",
      visibility: "everyone",
      created_at: `${base}${micros}+00`,
    });
  }

  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = `/api/v3/feed/posts?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await app.inject({ method: "GET", url, headers: auth(user.id, user.email) });
    const body = res.json();
    seen.push(...body.posts.map((p: { content: string }) => p.content));
    cursor = body.next_cursor;
    if (!cursor) break;
  }

  assert.equal(seen.length, 5, "no post may be skipped when timestamps collide to the millisecond");
  assert.equal(new Set(seen).size, 5, "and none may repeat");
});

test("the cursor helper column never reaches the client", async () => {
  const app = await getApp();
  const user = await createUser();
  await createPost(user.id);
  const res = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(user.id, user.email) });
  assert.equal("cursor_ts" in res.json().posts[0], false, "cursor_ts is an internal ordering detail");
});

test("limit is capped server-side", async () => {
  const app = await getApp();
  const user = await createUser();
  const res = await app.inject({
    method: "GET", url: "/api/v3/feed/posts?limit=5000", headers: auth(user.id, user.email),
  });
  assert.equal(res.statusCode, 400, "an over-cap limit must not be silently honoured");
});

// 6. Reaction semantics + count integrity — the regression the upsert-row-count approach would cause.
test("reactions: add is idempotent, changing the emoji does not change the count, remove clamps at zero", async () => {
  const app = await getApp();
  const user = await createUser();
  const post = await createPost(user.id);
  const url = `/api/v3/feed/posts/${post.id}/reactions`;
  const headers = auth(user.id, user.email);
  const countOf = async () => Number((await masterKnex("feed_posts").where({ id: post.id }).first()).reactions_count);
  const rowsOf = async () => Number((await masterKnex("feed_reactions").where({ post_id: post.id }).count())[0].count);

  await app.inject({ method: "POST", url, headers, payload: { emoji: "👍" } });
  assert.equal(await countOf(), 1);
  assert.equal(await rowsOf(), 1);

  // Same emoji again — idempotent.
  await app.inject({ method: "POST", url, headers, payload: { emoji: "👍" } });
  assert.equal(await countOf(), 1);
  assert.equal(await rowsOf(), 1);

  // Different emoji — an UPDATE, not a new reaction. ON CONFLICT's row count would wrongly read 1 here.
  await app.inject({ method: "POST", url, headers, payload: { emoji: "🎉" } });
  assert.equal(await countOf(), 1, "changing an emoji must not increment");
  assert.equal(await rowsOf(), 1);
  assert.equal((await masterKnex("feed_reactions").where({ post_id: post.id }).first()).emoji, "🎉");

  const removed = await app.inject({ method: "DELETE", url, headers });
  assert.equal(removed.statusCode, 204);
  assert.equal(await countOf(), 0);

  // Removing again is a no-op and cannot drive the count negative.
  const removedAgain = await app.inject({ method: "DELETE", url, headers });
  assert.equal(removedAgain.statusCode, 204);
  assert.equal(await countOf(), 0);
});

test("reactions_count matches the actual row count after an interleaved sequence", async () => {
  const app = await getApp();
  const author = await createUser();
  const second = await createUser();
  const third = await createUser();
  const post = await createPost(author.id);
  const url = `/api/v3/feed/posts/${post.id}/reactions`;

  await app.inject({ method: "POST", url, headers: auth(author.id, author.email), payload: { emoji: "👍" } });
  await app.inject({ method: "POST", url, headers: auth(second.id, second.email), payload: { emoji: "👍" } });
  await app.inject({ method: "POST", url, headers: auth(second.id, second.email), payload: { emoji: "❤️" } });
  await app.inject({ method: "POST", url, headers: auth(third.id, third.email), payload: { emoji: "👍" } });
  await app.inject({ method: "DELETE", url, headers: auth(second.id, second.email) });
  await app.inject({ method: "DELETE", url, headers: auth(second.id, second.email) });

  const stored = Number((await masterKnex("feed_posts").where({ id: post.id }).first()).reactions_count);
  const actual = Number((await masterKnex("feed_reactions").where({ post_id: post.id }).count())[0].count);
  assert.equal(stored, actual);
  assert.equal(stored, 2);
});

test("concurrent identical reactions leave one row and a count of one", async () => {
  const app = await getApp();
  const user = await createUser();
  const post = await createPost(user.id);
  const url = `/api/v3/feed/posts/${post.id}/reactions`;

  await Promise.all(
    Array.from({ length: 5 }, () =>
      app.inject({ method: "POST", url, headers: auth(user.id, user.email), payload: { emoji: "👍" } }),
    ),
  );

  const stored = Number((await masterKnex("feed_posts").where({ id: post.id }).first()).reactions_count);
  const actual = Number((await masterKnex("feed_reactions").where({ post_id: post.id }).count())[0].count);
  assert.equal(actual, 1);
  assert.equal(stored, 1, "the double-tap race must not double-count");
});

// The create response must be the same shape as a timeline row. When it wasn't, a just-posted card rendered
// as "Someone" with no delete action until the page was reloaded.
test("a created post comes back fully hydrated, identical in shape to a listed one", async () => {
  const app = await getApp();
  const author = await createUser({ first_name: "Wonjala", last_name: "Joshi", photo_url: "avatar.png" });

  const created = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(author.id, author.email),
    payload: { content: "hello" },
  });
  assert.equal(created.statusCode, 201);
  const post = created.json();

  assert.equal(post.author_first_name, "Wonjala", "the author name must be in the create response");
  assert.equal(post.author_last_name, "Joshi");
  assert.equal(post.author_photo_url, "avatar.png");
  assert.equal(post.is_mine, true, "the author must be able to delete their own new post immediately");
  assert.equal(post.my_reaction, null);
  assert.deepEqual(post.media, []);

  // Same keys as the timeline shape — a field added to one response and not the other reintroduces the bug.
  const listed = (await app.inject({
    method: "GET", url: "/api/v3/feed/posts", headers: auth(author.id, author.email),
  })).json().posts[0];
  assert.deepEqual(Object.keys(post).sort(), Object.keys(listed).sort());
});

test("is_mine and my_reaction are decided server-side", async () => {
  const app = await getApp();
  const author = await createUser();
  const viewer = await createUser();
  const post = await createPost(author.id);
  await app.inject({
    method: "POST", url: `/api/v3/feed/posts/${post.id}/reactions`,
    headers: auth(viewer.id, viewer.email), payload: { emoji: "👍" },
  });

  const asAuthor = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(author.id, author.email) });
  assert.equal(asAuthor.json().posts[0].is_mine, true);
  assert.equal(asAuthor.json().posts[0].my_reaction, null);

  const asViewer = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(viewer.id, viewer.email) });
  assert.equal(asViewer.json().posts[0].is_mine, false);
  assert.equal(asViewer.json().posts[0].my_reaction, "👍");
});

// The card shows who reacted, not just how many, so the API groups by emoji and carries a few reactors.
test("reactions come back grouped by emoji, most-reacted first, with reactor avatars", async () => {
  const app = await getApp();
  const author = await createUser({ first_name: "Ann" });
  const second = await createUser({ first_name: "Ben" });
  const third = await createUser({ first_name: "Cal" });
  const fourth = await createUser({ first_name: "Dot" });
  const fifth = await createUser({ first_name: "Eve" });
  const post = await createPost(author.id);
  const url = `/api/v3/feed/posts/${post.id}/reactions`;

  // One 🎉 and four 👍 — so 👍 must sort first.
  await app.inject({ method: "POST", url, headers: auth(author.id, author.email), payload: { emoji: "🎉" } });
  for (const user of [second, third, fourth, fifth]) {
    await app.inject({ method: "POST", url, headers: auth(user.id, user.email), payload: { emoji: "👍" } });
  }

  const res = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(author.id, author.email) });
  const listed = res.json().posts[0];

  assert.equal(listed.reactions.length, 2);
  assert.equal(listed.reactions[0].emoji, "👍");
  assert.equal(listed.reactions[0].count, 4);
  assert.equal(listed.reactions[0].reactors.length, 3, "the avatar stack is capped, the count is not");
  assert.deepEqual(
    listed.reactions[0].reactors.map((r: { first_name: string }) => r.first_name),
    ["Ben", "Cal", "Dot"],
    "reactors come in the order they reacted",
  );
  assert.equal(listed.reactions[1].emoji, "🎉");
  assert.equal(listed.reactions[1].count, 1);

  // Totals must agree with the groups, or the card contradicts itself.
  const summed = listed.reactions.reduce((total: number, g: { count: number }) => total + g.count, 0);
  assert.equal(summed, listed.reactions_count);
});

test("changing an emoji moves the reactor between groups without inflating the total", async () => {
  const app = await getApp();
  const user = await createUser({ first_name: "Ann" });
  const post = await createPost(user.id);
  const url = `/api/v3/feed/posts/${post.id}/reactions`;
  const headers = auth(user.id, user.email);

  await app.inject({ method: "POST", url, headers, payload: { emoji: "👍" } });
  await app.inject({ method: "POST", url, headers, payload: { emoji: "❤️" } });

  const listed = (await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers })).json().posts[0];
  assert.equal(listed.reactions.length, 1, "the old group must be gone, not left at zero");
  assert.equal(listed.reactions[0].emoji, "❤️");
  assert.equal(listed.reactions[0].count, 1);
  assert.equal(listed.reactions_count, 1);
  assert.equal(listed.my_reaction, "❤️");
});

test("a soft-deleted post disappears from the timeline", async () => {
  const app = await getApp();
  const user = await createUser();
  const post = await createPost(user.id, { content: "goodbye" });
  await app.inject({ method: "DELETE", url: `/api/v3/feed/posts/${post.id}`, headers: auth(user.id, user.email) });
  const res = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(user.id, user.email) });
  assert.equal(res.json().posts.length, 0);
});

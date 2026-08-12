/**
 * Media attachment and "Write with AI".
 *
 * The GCS upload itself is not exercised (no bucket in test) — what matters here is the ownership rule that
 * stops a client attaching storage paths it never uploaded, the type allow-list, and the content/media
 * requirement. Those are the parts a bug would actually hurt.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getApp, closeApp, resetDb, createUser, auth, masterKnex } from "./helpers.js";
import { kindFor } from "../src/modules/feed/services/feed-media.service.js";
import { isConfigured } from "../src/shared/ai/gemini.js";

before(async () => {
  await getApp();
});
after(closeApp);
beforeEach(resetDb);

/** Stand in for a real upload: an uploaded_files row is what ownership is checked against. */
async function recordUpload(userId: number, userUuid: string, path: string, mime = "image/png") {
  await masterKnex("uploaded_files").insert({
    uploaded_by: userId,
    entity_type: "platform_user",
    entity_id: userUuid,
    category: "feed-media",
    original_name: "photo.png",
    storage_path: path,
    mime_type: mime,
    size_bytes: 1024,
  });
}

test("media kinds map from mime type, and anything else is rejected", () => {
  assert.equal(kindFor("image/png"), "image");
  assert.equal(kindFor("image/webp"), "image");
  assert.equal(kindFor("video/mp4"), "video");
  assert.equal(kindFor("video/quicktime"), "video");
  assert.throws(() => kindFor("application/pdf"), /Unsupported media type/);
  assert.throws(() => kindFor("text/html"), /Unsupported media type/);
});

test("a post can carry media the caller uploaded", async () => {
  const app = await getApp();
  const user = await createUser();
  const path = "platform-users/u/feed-media/1-abc.png";
  await recordUpload(user.id, user.uuid, path);

  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: { content: "with a photo", media: [{ storage_path: path, type: "image", mime_type: "image/png" }] },
  });
  assert.equal(res.statusCode, 201);

  const stored = await masterKnex("feed_posts").where({ id: res.json().id }).first();
  assert.equal(stored.media.length, 1);
  assert.equal(stored.media[0].storage_path, path);
});

// The important security rule: media references are not free-form.
test("a post cannot reference media the caller did not upload", async () => {
  const app = await getApp();
  const owner = await createUser();
  const attacker = await createUser();
  const path = "platform-users/owner/feed-media/private.png";
  await recordUpload(owner.id, owner.uuid, path);

  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(attacker.id, attacker.email),
    payload: { content: "not mine", media: [{ storage_path: path, type: "image", mime_type: "image/png" }] },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error ?? res.json().message ?? "", /Unknown media reference/);
});

test("an invented storage path is rejected", async () => {
  const app = await getApp();
  const user = await createUser();
  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: { content: "guessed", media: [{ storage_path: "anything/goes.png", type: "image", mime_type: "image/png" }] },
  });
  assert.equal(res.statusCode, 400);
});

test("a media-only post is allowed, but an entirely empty one is not", async () => {
  const app = await getApp();
  const user = await createUser();
  const path = "platform-users/u/feed-media/only.png";
  await recordUpload(user.id, user.uuid, path);

  const mediaOnly = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: { content: "", media: [{ storage_path: path, type: "image", mime_type: "image/png" }] },
  });
  assert.equal(mediaOnly.statusCode, 201, "an image with no caption is a valid post");

  const empty = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: { content: "" },
  });
  assert.equal(empty.statusCode, 400, "no text and no media is not a post");
});

test("at most four attachments", async () => {
  const app = await getApp();
  const user = await createUser();
  const media = [];
  for (let i = 0; i < 5; i++) {
    const path = `platform-users/u/feed-media/${i}.png`;
    await recordUpload(user.id, user.uuid, path);
    media.push({ storage_path: path, type: "image" as const, mime_type: "image/png" });
  }

  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: { content: "too many", media },
  });
  assert.equal(res.statusCode, 400);
});

test("posts without media come back with an empty array, never null", async () => {
  const app = await getApp();
  const user = await createUser();
  await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: { content: "plain text" },
  });

  const res = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(user.id, user.email) });
  assert.deepEqual(res.json().posts[0].media, []);
});

// ── Write with AI ──

test("the AI availability probe reports the deployment's real state", async () => {
  const app = await getApp();
  const user = await createUser();
  const res = await app.inject({ method: "GET", url: "/api/v3/feed/ai/available", headers: auth(user.id, user.email) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().available, isConfigured());
});

test("AI compose rejects unknown fields and over-long input", async () => {
  const app = await getApp();
  const user = await createUser();

  const forged = await app.inject({
    method: "POST", url: "/api/v3/feed/ai/compose",
    headers: auth(user.id, user.email),
    payload: { post_type: "social", model: "gpt-4" },
  });
  assert.equal(forged.statusCode, 400, "the schema is strict — no passing provider options through");

  const tooLong = await app.inject({
    method: "POST", url: "/api/v3/feed/ai/compose",
    headers: auth(user.id, user.email),
    payload: { post_type: "social", instruction: "x".repeat(501) },
  });
  assert.equal(tooLong.statusCode, 400);
});

test("AI compose without a provider key fails as a 400, not a 500", async (t) => {
  if (isConfigured()) {
    t.skip("GEMINI_API_KEY is configured in this environment");
    return;
  }
  const app = await getApp();
  const user = await createUser();
  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/ai/compose",
    headers: auth(user.id, user.email),
    payload: { post_type: "social" },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error ?? res.json().message ?? "", /not configured/i);
});

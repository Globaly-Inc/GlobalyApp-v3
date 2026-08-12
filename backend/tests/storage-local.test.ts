/**
 * The local storage driver — the fallback that makes uploads work without a GCS bucket.
 *
 * This is the full round trip that a browser performs: upload the file, then load it back from the returned
 * URL with no Authorization header, because an <img> src cannot send one.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { getApp, closeApp, resetDb, createUser, auth, masterKnex } from "./helpers.js";
import * as local from "../src/shared/storage/local-driver.js";
import { isCloudConfigured } from "../src/shared/storage/storageService.js";
import { config } from "../src/config.js";

// A 1x1 PNG — small, real, and has a valid signature so nothing can claim it isn't an image.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

function multipartBody(filename: string, mimeType: string, content: Buffer) {
  const boundary = "----testboundary1234567890";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { boundary, payload: Buffer.concat([head, content, tail]) };
}

before(async () => {
  await getApp();
});
after(async () => {
  await closeApp();
  await rm(resolve(process.cwd(), config.LOCAL_STORAGE_DIR), { recursive: true, force: true });
});
beforeEach(resetDb);

test("this environment is using the local driver", () => {
  // If a bucket ever gets configured here, the round-trip assertions below stop being meaningful.
  assert.equal(isCloudConfigured(), false, "expected no GCS bucket in the test environment");
});

test("upload then read back through the signed URL, with no auth header", async () => {
  const app = await getApp();
  const user = await createUser();
  const { boundary, payload } = multipartBody("photo.png", "image/png", PNG);

  const upload = await app.inject({
    method: "POST", url: "/api/v3/feed/media",
    headers: { ...auth(user.id, user.email), "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  assert.equal(upload.statusCode, 201, upload.body);
  const media = upload.json();
  assert.equal(media.type, "image");
  assert.equal(media.mime_type, "image/png");
  assert.match(media.url, /\/api\/v3\/files\/local\?/);

  // The uploaded_files row is what post attachment authorization is checked against.
  const record = await masterKnex("uploaded_files").where({ storage_path: media.storage_path }).first();
  assert.ok(record, "the upload must be recorded");
  assert.equal(record.category, "feed-media");
  assert.equal(Number(record.uploaded_by), user.id);

  // Read it back exactly as a browser would: URL only, no Authorization header.
  const path = media.url.slice(media.url.indexOf("/api/v3"));
  const read = await app.inject({ method: "GET", url: path });
  assert.equal(read.statusCode, 200);
  assert.equal(read.headers["content-type"], "image/png");
  assert.equal(read.headers["content-disposition"], "inline");
  assert.ok(read.rawPayload.equals(PNG), "the bytes must survive the round trip");
});

test("a tampered or missing signature is refused", async () => {
  const app = await getApp();
  const user = await createUser();
  const { boundary, payload } = multipartBody("photo.png", "image/png", PNG);
  const upload = await app.inject({
    method: "POST", url: "/api/v3/feed/media",
    headers: { ...auth(user.id, user.email), "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  const media = upload.json();
  const url = new URL(media.url);

  const tampered = await app.inject({
    method: "GET",
    url: `/api/v3/files/local?path=${encodeURIComponent(media.storage_path)}&exp=${url.searchParams.get("exp")}&sig=${"0".repeat(64)}`,
  });
  assert.equal(tampered.statusCode, 403);

  const unsigned = await app.inject({
    method: "GET", url: `/api/v3/files/local?path=${encodeURIComponent(media.storage_path)}`,
  });
  assert.equal(unsigned.statusCode, 400, "no signature at all is a bad request");
});

test("an expired link is refused", () => {
  const signed = local.signUrl("some/file.png", -10); // already expired
  const url = new URL(signed);
  assert.throws(
    () => local.verifySignature("some/file.png", url.searchParams.get("exp")!, url.searchParams.get("sig")!),
    /expired/i,
  );
});

test("a signature for one path cannot read another", () => {
  const signed = local.signUrl("mine/secret.png");
  const url = new URL(signed);
  assert.throws(
    () => local.verifySignature("someone-else/secret.png", url.searchParams.get("exp")!, url.searchParams.get("sig")!),
    /Invalid signature/,
  );
});

test("path traversal cannot escape the storage root", async () => {
  await assert.rejects(local.save("../../escaped.txt", Buffer.from("nope")), /Invalid storage path/);
  await assert.rejects(local.read("../../../etc/passwd"), /Invalid storage path|not found/i);
});

test("a non-media upload is still rejected by the allow-list", async () => {
  const app = await getApp();
  const user = await createUser();
  const { boundary, payload } = multipartBody("notes.txt", "text/plain", Buffer.from("hello"));
  const res = await app.inject({
    method: "POST", url: "/api/v3/feed/media",
    headers: { ...auth(user.id, user.email), "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  assert.equal(res.statusCode, 400);
});

test("an uploaded image survives being attached to a post and listed back", async () => {
  const app = await getApp();
  const user = await createUser();
  const { boundary, payload } = multipartBody("attach.png", "image/png", PNG);
  const upload = await app.inject({
    method: "POST", url: "/api/v3/feed/media",
    headers: { ...auth(user.id, user.email), "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  const media = upload.json();

  const created = await app.inject({
    method: "POST", url: "/api/v3/feed/posts",
    headers: auth(user.id, user.email),
    payload: {
      content: "look at this",
      media: [{ storage_path: media.storage_path, type: media.type, mime_type: media.mime_type }],
    },
  });
  assert.equal(created.statusCode, 201);

  const list = await app.inject({ method: "GET", url: "/api/v3/feed/posts", headers: auth(user.id, user.email) });
  const post = list.json().posts[0];
  assert.equal(post.media.length, 1);
  assert.ok(post.media[0].url, "the timeline must hand the browser a loadable URL");

  const read = await app.inject({ method: "GET", url: post.media[0].url.slice(post.media[0].url.indexOf("/api/v3")) });
  assert.equal(read.statusCode, 200);
});

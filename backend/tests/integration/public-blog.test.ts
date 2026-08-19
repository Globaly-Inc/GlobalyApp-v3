// The public blog reads — anonymous, unauthenticated, and until now `select *`.
//
// Two defects fixed here, both proven through the route rather than the repository:
//
//   1. `GET /api/v3/blog/posts` published every column of superadmin.blog_posts to
//      anonymous callers — the full `content` body on a list endpoint, plus
//      `creator_id`, `deleted_at`, `seo_score` and `focus_keyword`. The projection is
//      now an allowlist, so a column a later migration adds is private by default
//      instead of published by default. The last assertion is the one that matters:
//      it fails on any *unexpected* key, not just on today's known-bad five.
//   2. V1 linked posts as /blog/{slug}; V3 shipped /blog/{id}. Both are in the wild,
//      so the detail route resolves either form.

import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { errorHandlerPlugin } from "../../src/core/plugins/error-handler.plugin.js";
import blogModule from "../../src/modules/blog/index.js";
import { masterKnex } from "../../src/core/db/master-pool.js";
import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `blogpub${process.pid}`;

// Exactly what a logged-out visitor is allowed to see on a card.
const CARD_KEYS = [
  "id", "title", "slug", "excerpt", "category", "country_focus", "tags",
  "author_name", "author_avatar_url", "cover_image_url", "published_at",
  "views", "reading_time_minutes", "meta_title", "meta_description",
].sort();

describeDb("public blog endpoints", () => {
  let app: FastifyInstance;
  let postId = 0;

  const get = async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(blogModule);
    await app.ready();

    await masterKnex("superadmin.blog_posts").where("slug", "like", `${TAG}%`).del();

    const [row] = await masterKnex("superadmin.blog_posts")
      .insert({
        title: `Published ${TAG}`,
        slug: `${TAG}-published`,
        excerpt: "Card excerpt.",
        content: "<p>The body, which belongs on the detail page only.</p>",
        category: `Category ${TAG}`,
        is_published: true,
        published_at: new Date(),
        // The columns that must never reach an anonymous caller from the list.
        seo_score: 87,
        focus_keyword: "internal seo note",
      })
      .returning("id");
    postId = typeof row === "object" ? row.id : row;

    await masterKnex("superadmin.blog_posts").insert({
      title: `Draft ${TAG}`,
      slug: `${TAG}-draft`,
      is_published: false,
    });
  }, 60_000);

  afterAll(async () => {
    await masterKnex("superadmin.blog_posts").where("slug", "like", `${TAG}%`).del();
    await app?.close();
    await masterKnex.destroy();
  });

  it("lists published posts without the body or any internal column", async () => {
    const { status, body } = await get(`/api/v3/blog/posts?category=Category%20${TAG}`);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe(`${TAG}-published`);
    // Not a blocklist of today's leaks — the whole key set is pinned, so a column
    // added by a later migration fails this test instead of shipping publicly.
    expect(Object.keys(body.data[0]).sort()).toEqual(CARD_KEYS);
  });

  it("does not list unpublished posts", async () => {
    const { body } = await get("/api/v3/blog/posts?limit=100");
    const slugs = body.data.map((p: { slug: string }) => p.slug);

    expect(slugs).not.toContain(`${TAG}-draft`);
  });

  it("serves the detail page by slug, with the body", async () => {
    const { status, body } = await get(`/api/v3/blog/posts/${TAG}-published`);

    expect(status, "V1's URLs were /blog/{slug} — they must still resolve").toBe(200);
    expect(body.content).toContain("detail page only");
    expect(body.creator_id, "internal columns stay internal on the detail read too").toBeUndefined();
    expect(body.seo_score).toBeUndefined();
    expect(body.deleted_at).toBeUndefined();
  });

  it("serves the same post by numeric id", async () => {
    const { status, body } = await get(`/api/v3/blog/posts/${postId}`);

    expect(status).toBe(200);
    expect(body.slug).toBe(`${TAG}-published`);
  });

  it("404s an unpublished post's slug rather than revealing it", async () => {
    const { status } = await get(`/api/v3/blog/posts/${TAG}-draft`);

    expect(status).toBe(404);
  });
});

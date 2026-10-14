/**
 * One-off: repoints blog cover URLs at the current API.
 *
 * Manual cover uploads store `${API_URL}/api/v3/blog/covers/<file>` as an absolute URL. With
 * API_URL unset the API defaulted to http://localhost:3000, and older rows name the previous API
 * host, so those covers are broken. This swaps the origin for API_URL and keeps the path. Safe to
 * re-run: rows already on API_URL don't match.
 *
 *   node --import tsx scripts/fix-blog-cover-urls.ts           dry run
 *   node --import tsx scripts/fix-blog-cover-urls.ts --apply   writes
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { config } from "../src/config.js";

const apply = process.argv.includes("--apply");
const COVER_PATH = "/api/v3/blog/covers/";
const STALE_ORIGINS = ["http://localhost:3000", "https://api.globalyapp.com", "https://apistaging.globalyapp.com"];

async function main() {
  const target = config.API_URL.replace(/\/+$/, "");
  if (!target.startsWith("https://")) throw new Error(`API_URL is "${target}" — set it to the public API origin first.`);

  const rows = await masterKnex("superadmin.blog_posts")
    .whereRaw(`split_part(cover_image_url, ?, 1) IN (${STALE_ORIGINS.map(() => "?").join(", ")})`, [COVER_PATH, ...STALE_ORIGINS])
    .select<{ id: number; cover_image_url: string }[]>("id", "cover_image_url");

  for (const row of rows) {
    const next = target + COVER_PATH + row.cover_image_url.split(COVER_PATH)[1];
    console.log(`${apply ? "fixed" : "would fix"} post ${row.id}: ${row.cover_image_url} -> ${next}`);
    if (apply) await masterKnex("superadmin.blog_posts").where({ id: row.id }).update({ cover_image_url: next });
  }
  console.log(`${rows.length} cover(s) ${apply ? "fixed" : "to fix"}.`);
  if (!apply) console.log("Dry run — pass --apply to write.");
  await masterKnex.destroy();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

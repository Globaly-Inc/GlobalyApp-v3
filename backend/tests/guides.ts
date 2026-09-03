/**
 * Guides lead-gen landing page tests — public serializer, lead dedupe/resend, honeypot,
 * and the delivery email template.
 * Run: node --import tsx tests/guides.ts   (or: npm run test:guides)
 *
 * Style matches tests/enquiries/messages.ts: exercises services directly (routes are thin
 * wrappers around them), fixtures created per-scenario and deleted in a `finally` block so the
 * suite is safe to re-run against the shared dev database.
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import { config } from "../src/config.js";
import * as guidesService from "../src/modules/superadmin/marketing/guides/services/guides.service.js";
import { guideDeliveryEmail, esc } from "../src/shared/mail/templates.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function ok(cond: boolean, label = "") {
  if (!cond) throw new Error(label || "expected condition to be true");
}

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = () => `${RUN}${(seq++).toString(36)}`;

async function makeGuide(overrides: Record<string, unknown> = {}) {
  const tag = uniq();
  const [row] = await masterKnex("superadmin.guides")
    .insert({
      title: `Test Guide ${tag}`,
      slug: `test-guide-${tag}`,
      is_published: true,
      pdf_url: `guides/pdfs/${tag}.pdf`,
      pdf_cover_image_url: "https://storage.googleapis.com/bucket/guides/covers/cover.jpg",
      ...overrides,
    })
    .returning("*");
  return row as { id: number; slug: string; title: string };
}

async function cleanupGuide(id: number) {
  await masterKnex("superadmin.guide_leads").where({ guide_id: id }).delete();
  await masterKnex("superadmin.guides").where({ id }).delete();
}

async function main() {
  console.log(`Guides tests — DB=${config.DB_NAME}  run=${RUN}`);

  await assert("public serializer strips pdf_url, keeps other fields", async () => {
    const guide = await makeGuide();
    try {
      const publicGuide = await guidesService.getPublicGuideBySlug(guide.slug);
      ok(!!publicGuide, "guide found");
      ok(!("pdf_url" in (publicGuide as object)), "pdf_url absent from public payload");
      eq((publicGuide as any).title, guide.title, "title");
      eq((publicGuide as any).pdf_cover_image_url, "https://storage.googleapis.com/bucket/guides/covers/cover.jpg", "cover kept");
    } finally {
      await cleanupGuide(guide.id);
    }
  });

  await assert("unpublished guide is not publicly visible", async () => {
    const guide = await makeGuide({ is_published: false });
    try {
      const publicGuide = await guidesService.getPublicGuideBySlug(guide.slug);
      eq(publicGuide, null, "unpublished guide hidden from public reads");
    } finally {
      await cleanupGuide(guide.id);
    }
  });

  await assert("honeypot short-circuits: non-empty website -> ok:true, no row inserted", async () => {
    const guide = await makeGuide();
    try {
      const email = `bot-${uniq()}@test.local`;
      const result = await guidesService.submitLead(guide.slug, { name: "Bot", email, website: "http://spam.example" });
      eq(result.ok, true, "response still ok:true (no signal to the bot)");
      const row = await masterKnex("superadmin.guide_leads").where({ guide_id: guide.id, email }).first();
      ok(!row, "no lead row inserted");
    } finally {
      await cleanupGuide(guide.id);
    }
  });

  await assert("lead submit dedupes on (guide_id, email) and re-submission resends", async () => {
    const guide = await makeGuide();
    try {
      const email = `lead-${uniq()}@test.local`;
      await guidesService.submitLead(guide.slug, { name: "First Name", email, website: "" });
      const first = await masterKnex("superadmin.guide_leads").where({ guide_id: guide.id, email }).first();
      ok(!!first, "lead inserted");

      // Simulate the first email having already gone out.
      await masterKnex("superadmin.guide_leads").where({ id: first.id }).update({ email_sent_at: masterKnex.fn.now() });

      await guidesService.submitLead(guide.slug, { name: "Updated Name", email, website: "" });
      const rows = await masterKnex("superadmin.guide_leads").where({ guide_id: guide.id, email });
      eq(rows.length, 1, "still exactly one lead row (deduped, not duplicated)");
      eq(rows[0].id, first.id, "same lead id preserved across resubmission");
      eq(rows[0].name, "Updated Name", "name refreshed on resubmission");
      eq(rows[0].email_sent_at, null, "email_sent_at reset -> worker will resend");
    } finally {
      await cleanupGuide(guide.id);
    }
  });

  await assert("submitLead on an unknown/unpublished slug throws NotFoundError", async () => {
    let threw = false;
    try {
      await guidesService.submitLead(`nonexistent-guide-${uniq()}`, { name: "X", email: "x@test.local", website: "" });
    } catch (err: any) {
      threw = err?.name === "NotFoundError" || err?.statusCode === 404;
    }
    ok(threw, "unknown slug rejected");
  });

  await assert("guideDeliveryEmail() escapes the title and embeds the signed link", () => {
    const dangerousTitle = `Study & Work <Guide>`;
    const downloadUrl = "https://storage.googleapis.com/bucket/guides/pdfs/abc.pdf?X-Goog-Signature=deadbeef";
    const { html, subject } = guideDeliveryEmail({ guideTitle: dangerousTitle, downloadUrl });
    ok(html.includes(esc(dangerousTitle)), "escaped title present in html");
    ok(!html.includes("<Guide>"), "raw unescaped title absent from html");
    ok(html.includes(downloadUrl), "signed download link present in html");
    ok(subject.includes(dangerousTitle), "subject (plain text, no HTML risk) carries the raw title");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nSUITE ERROR:", err);
  await masterKnex.destroy();
  process.exit(1);
});

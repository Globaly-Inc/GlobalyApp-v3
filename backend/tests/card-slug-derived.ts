/**
 * A course card's link to /course/[slug] must not depend on the model transcribing a slug.
 *
 * The symptom: cards whose `slug` the model dropped or mistyped fell back to `source_url` — the
 * institution's own website — or to nothing, so clicking the card did nothing. The id and name
 * are already required by parseCards, and the public page parses only the trailing id fragment,
 * so the slug is derived server-side in withInstitutionMedia for every card on every path.
 *
 * Run: npm run test:card-slug-derived    No DB: the media lookup is allowed to fail.
 */
import assert from "node:assert/strict";
import { withInstitutionMedia } from "../src/modules/ai-counsellor/services/chat.service.js";
import { parseCourseIdFragment } from "../src/modules/search/utils/slug.js";

const ID = "e97c46aa-1111-4222-8333-444455556666";
const card = (over: Record<string, unknown> = {}) =>
  ({ id: ID, name: "Aerospace Engineering MEng", institution: "AIT", intakes: [], study_modes: [], ...over }) as never;

const [missing, wrong, right] = await withInstitutionMedia([
  card(),
  card({ slug: "something-the-model-made-up" }),
  card({ slug: "aerospace-engineering-meng-e97c46" }),
]);

// The id fragment is what the public page resolves on, so every card must carry this one.
for (const [label, c] of [["missing", missing], ["wrong", wrong], ["copied", right]] as const) {
  assert.equal(parseCourseIdFragment((c as { slug: string }).slug), "e97c46", `${label} slug points at the course`);
}
assert.equal((missing as { slug: string }).slug, "aerospace-engineering-meng-e97c46", "name is slugified, not dropped");
assert.equal((wrong as { slug: string }).slug, (right as { slug: string }).slug, "a made-up slug is replaced, not kept");

// Empty in, empty out — the enrichment must not invent a card.
assert.deepEqual(await withInstitutionMedia([]), []);

console.log("card-slug-derived: ok");

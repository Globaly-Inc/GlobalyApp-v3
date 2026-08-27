import type { Knex } from "knex";

/**
 * The standardised tests the platform already talks about — the ten V1 shipped logos for, plus every
 * other test named across the AI-counsellor knowledge base and the extraction schema.
 *
 * `image_url` points at the frontend's own /public/logos assets. Each was taken from the test
 * provider's own site (ets.org, cambridgeenglish.org, testdaf.de, chinesetest.cn, ucat.ac.uk,
 * languagecert.org, paragontesting.ca, ada.org); an admin replacing one uploads a file from
 * Superadmin ▸ Platform ▸ Categories ▸ Tests and the row switches to a storage URL.
 *
 * Four rows ship without an image because their provider publishes no standalone exam logo — see
 * the comments below. They are seeded anyway so the name still resolves, and the tab is where a
 * logo gets added.
 */
const TESTS = [
  // ── Language ──
  { slug: "ielts", name: "IELTS", category: "language", image_url: "/logos/IELTS.svg", sort_order: 1 },
  { slug: "toefl", name: "TOEFL", category: "language", image_url: "/logos/TOEFL.svg", sort_order: 2 },
  { slug: "pte", name: "PTE", category: "language", image_url: "/logos/PTE.jpg", sort_order: 3 },
  { slug: "duolingo", name: "Duolingo", category: "language", image_url: "/logos/Duolingo.svg", sort_order: 4 },
  { slug: "oet", name: "OET", category: "language", image_url: "/logos/OET.png", sort_order: 5 },
  { slug: "toeic", name: "TOEIC", category: "language", image_url: "/logos/TOEIC.svg", sort_order: 6 },
  { slug: "celpip", name: "CELPIP", category: "language", image_url: "/logos/CELPIP.png", sort_order: 7 },
  { slug: "languagecert", name: "LanguageCert", category: "language", image_url: "/logos/LanguageCert.png", sort_order: 8 },
  // Both Cambridge exams carry the one Cambridge English mark, but stay separate rows so a course
  // asking for C1 doesn't read as asking for C2.
  { slug: "cambridge_c1", name: "Cambridge C1 Advanced", category: "language", image_url: "/logos/Cambridge.svg", sort_order: 9 },
  { slug: "cambridge_c2", name: "Cambridge C2 Proficiency", category: "language", image_url: "/logos/Cambridge.svg", sort_order: 10 },
  { slug: "testdaf", name: "TestDaF", category: "language", image_url: "/logos/TestDaF.svg", sort_order: 11 },
  { slug: "hsk", name: "HSK", category: "language", image_url: "/logos/HSK.png", sort_order: 12 },

  // ── Academic ──
  { slug: "sat", name: "SAT", category: "academic", image_url: "/logos/SAT.png", sort_order: 20 },
  { slug: "act", name: "ACT", category: "academic", image_url: "/logos/ACT.png", sort_order: 21 },
  { slug: "gre", name: "GRE", category: "academic", image_url: "/logos/GRE.webp", sort_order: 22 },
  { slug: "gmat", name: "GMAT", category: "academic", image_url: "/logos/GMAT.png", sort_order: 23 },
  { slug: "lsat", name: "LSAT", category: "academic", image_url: "/logos/LSAT.png", sort_order: 24 },
  // The DAT is an ADA programme and carries the ADA mark — that is the artwork on its own materials.
  { slug: "dat", name: "DAT", category: "academic", image_url: "/logos/DAT.svg", sort_order: 25 },
  { slug: "ucat", name: "UCAT", category: "academic", image_url: "/logos/UCAT.png", sort_order: 26 },
  // No logo available: aamc.org renders its header client-side and publishes only a 16px icon.
  { slug: "mcat", name: "MCAT", category: "academic", image_url: null, sort_order: 27 },
  // No logo available: gamsat.acer.org publishes only a wide banner and ACER's own corporate mark.
  { slug: "gamsat", name: "GAMSAT", category: "academic", image_url: null, sort_order: 28 },
  // No logo available: NEET and JEE share one 16px NTA favicon; the site art is the national emblem.
  { slug: "neet", name: "NEET", category: "academic", image_url: null, sort_order: 29 },
  { slug: "jee", name: "JEE", category: "academic", image_url: null, sort_order: 30 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const test of TESTS) {
    const exists = await knex("tests").where({ slug: test.slug }).first();
    if (!exists) await knex("tests").insert({ ...test, is_active: true });
  }
}

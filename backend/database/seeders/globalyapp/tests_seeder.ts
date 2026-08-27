import type { Knex } from "knex";

/**
 * The standardised tests the platform already talks about — the ten V1 shipped logos for, plus every
 * other test named across the AI-counsellor knowledge base and the extraction schema.
 *
 * No row carries an image on purpose: the logo is uploaded per test from Superadmin ▸ Platform ▸
 * Categories ▸ Tests, so the artwork is whatever an admin chose rather than whatever a seeder
 * guessed. Every surface already handles a null image — the course tile and profile row simply
 * render the name.
 */
const TESTS = [
  // ── Language ──
  { slug: "ielts", name: "IELTS", category: "language", sort_order: 1 },
  { slug: "toefl", name: "TOEFL", category: "language", sort_order: 2 },
  { slug: "pte", name: "PTE", category: "language", sort_order: 3 },
  { slug: "duolingo", name: "Duolingo", category: "language", sort_order: 4 },
  { slug: "oet", name: "OET", category: "language", sort_order: 5 },
  { slug: "toeic", name: "TOEIC", category: "language", sort_order: 6 },
  { slug: "celpip", name: "CELPIP", category: "language", sort_order: 7 },
  { slug: "languagecert", name: "LanguageCert", category: "language", sort_order: 8 },
  // Separate rows so a course asking for C1 doesn't read as asking for C2.
  { slug: "cambridge_c1", name: "Cambridge C1 Advanced", category: "language", sort_order: 9 },
  { slug: "cambridge_c2", name: "Cambridge C2 Proficiency", category: "language", sort_order: 10 },
  { slug: "testdaf", name: "TestDaF", category: "language", sort_order: 11 },
  { slug: "hsk", name: "HSK", category: "language", sort_order: 12 },

  // ── Academic ──
  { slug: "sat", name: "SAT", category: "academic", sort_order: 20 },
  { slug: "act", name: "ACT", category: "academic", sort_order: 21 },
  { slug: "gre", name: "GRE", category: "academic", sort_order: 22 },
  { slug: "gmat", name: "GMAT", category: "academic", sort_order: 23 },
  { slug: "lsat", name: "LSAT", category: "academic", sort_order: 24 },
  { slug: "dat", name: "DAT", category: "academic", sort_order: 25 },
  { slug: "ucat", name: "UCAT", category: "academic", sort_order: 26 },
  { slug: "mcat", name: "MCAT", category: "academic", sort_order: 27 },
  { slug: "gamsat", name: "GAMSAT", category: "academic", sort_order: 28 },
  { slug: "neet", name: "NEET", category: "academic", sort_order: 29 },
  { slug: "jee", name: "JEE", category: "academic", sort_order: 30 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const test of TESTS) {
    const exists = await knex("tests").where({ slug: test.slug }).first();
    if (!exists) await knex("tests").insert({ ...test, image_url: null, is_active: true });
  }
}

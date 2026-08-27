/**
 * The platform test catalogue — Superadmin ▸ Platform ▸ Categories ▸ Tests.
 *
 * One list of rows for both academic and language tests; `category` says which. The image on a row is
 * the logo every surface shows next to that test, so course eligibility cards and profile test scores
 * resolve their logo from here instead of each keeping its own hardcoded map.
 */
export type PlatformTest = {
  id: number;
  name: string;
  slug: string;
  category: "academic" | "language";
  image_url: string | null;
};

/**
 * What `backend/database/seeders/globalyapp/tests_seeder.ts` puts in the table, so mock mode shows the
 * same catalogue a seeded database does. Both mock APIs read this — keep it in step with the seeder.
 */
export const SEEDED_TESTS: PlatformTest[] = [
  { id: 1, name: "IELTS", slug: "ielts", category: "language", image_url: null },
  { id: 2, name: "TOEFL", slug: "toefl", category: "language", image_url: null },
  { id: 3, name: "PTE", slug: "pte", category: "language", image_url: null },
  { id: 4, name: "Duolingo", slug: "duolingo", category: "language", image_url: null },
  { id: 5, name: "OET", slug: "oet", category: "language", image_url: null },
  { id: 6, name: "TOEIC", slug: "toeic", category: "language", image_url: null },
  { id: 7, name: "CELPIP", slug: "celpip", category: "language", image_url: null },
  { id: 8, name: "LanguageCert", slug: "languagecert", category: "language", image_url: null },
  { id: 9, name: "Cambridge C1 Advanced", slug: "cambridge_c1", category: "language", image_url: null },
  { id: 10, name: "Cambridge C2 Proficiency", slug: "cambridge_c2", category: "language", image_url: null },
  { id: 11, name: "TestDaF", slug: "testdaf", category: "language", image_url: null },
  { id: 12, name: "HSK", slug: "hsk", category: "language", image_url: null },
  { id: 13, name: "SAT", slug: "sat", category: "academic", image_url: null },
  { id: 14, name: "ACT", slug: "act", category: "academic", image_url: null },
  { id: 15, name: "GRE", slug: "gre", category: "academic", image_url: null },
  { id: 16, name: "GMAT", slug: "gmat", category: "academic", image_url: null },
  { id: 17, name: "LSAT", slug: "lsat", category: "academic", image_url: null },
  { id: 18, name: "DAT", slug: "dat", category: "academic", image_url: null },
  { id: 19, name: "UCAT", slug: "ucat", category: "academic", image_url: null },
  { id: 20, name: "MCAT", slug: "mcat", category: "academic", image_url: null },
  { id: 21, name: "GAMSAT", slug: "gamsat", category: "academic", image_url: null },
  { id: 22, name: "NEET", slug: "neet", category: "academic", image_url: null },
  { id: 23, name: "JEE", slug: "jee", category: "academic", image_url: null },
];

/**
 * The logo for a test named in free text.
 *
 * Course and profile rows store the test's name as typed or scraped, usually with a suffix
 * ("IELTS Academic", "TOEFL iBT"), so a row matches when its catalogue name is contained in the
 * given name. Longest catalogue name first: with both "GRE" and "GRE Subject" on file, "GRE Subject
 * Test" must not be claimed by the shorter row.
 */
export function testImage(name: string | null | undefined, tests: PlatformTest[]): string | null {
  if (!name) return null;
  const needle = name.toLowerCase();
  const match = [...tests]
    .sort((a, b) => b.name.length - a.name.length)
    .find((test) => needle.includes(test.name.toLowerCase()));
  return match?.image_url ?? null;
}

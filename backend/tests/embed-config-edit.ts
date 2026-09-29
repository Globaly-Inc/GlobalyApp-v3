/**
 * Widget appearance edit + key rotation: both UPDATEs are scoped to the owner, and rotation
 * mints the key in SQL rather than trusting a client value.
 *
 * Run: node --import tsx tests/embed-config-edit.ts   (npm run test:embed-config-edit)
 * Fake wire: tests/institution-memory.harness.ts. No DB needed.
 */
process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

const h = await import("./institution-memory.harness.js");
const { assert, finish, reset, find } = h;
const repo = await import("../src/modules/ai-counsellor/repositories/embed.repository.js");
const { EmbedConfigUpdateSchema } = await import("../src/modules/ai-counsellor/schemas/chat.schema.js");
const UPD = /^update "ai_embed_configs"/i;

console.log("\n1. update is owner-scoped and writes only what was sent");
{
  reset([[UPD, () => [{ id: 3 }]]]);
  await repo.update(3, { kind: "institution", id: 49 }, { greeting: "Hi!", logo_url: null });
  const s = find(UPD);
  assert(/"institution_id" = \$\d/.test(s.text) && s.values.includes(49) && s.values.includes(3), "WHERE id AND institution_id", s.text);
  assert(/"greeting" = \$\d/.test(s.text) && /"logo_url" = \$\d/.test(s.text) && !/"brand_color"/.test(s.text), "only greeting and logo_url in SET", s.text);
  assert(s.values.includes(null), "null clears the logo");
}

console.log("\n2. rotateKey mints server-side");
{
  reset([[UPD, () => [{ id: 3 }]]]);
  await repo.rotateKey(3, { kind: "business", id: 7 });
  const s = find(UPD);
  assert(/"embed_key" = gen_random_uuid\(\)/.test(s.text) && /"business_id" = \$\d/.test(s.text), "embed_key = gen_random_uuid() scoped to the business", s.text);
}

console.log("\n3. update schema");
{
  assert(EmbedConfigUpdateSchema.safeParse({ greeting: null, subtitle: "Replies fast" }).success, "nulls and strings accepted");
  assert(!EmbedConfigUpdateSchema.safeParse({ embed_key: "x" }).success, "embed_key cannot be edited (strict)");
  assert(!EmbedConfigUpdateSchema.safeParse({ brand_color: "blue" }).success, "brand colour must be #rrggbb");
}

await finish();

// Which keys of a PATCH body actually change the record. Edit forms send every field on save,
// so logging Object.keys(body) would list all of them as "changed".

const same = (a: unknown, b: unknown) => {
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  if (blank(a) && blank(b)) return true;
  if (blank(a) || blank(b)) return false;
  // "30000" (numeric column) vs 30000 (JSON body) is no change.
  if (typeof a !== "object" && typeof b !== "object") return String(a) === String(b);
  return JSON.stringify(a) === JSON.stringify(b);
};

/** `before` missing (couldn't load it) → every patched key, the old behaviour. */
export function changedFields(before: Record<string, unknown> | null | undefined, patch: Record<string, unknown>): string[] {
  if (!before) return Object.keys(patch);
  return Object.keys(patch).filter((k) => !same(before[k], patch[k]));
}

/** Self-check: `npx tsx src/shared/changed-fields.ts` */
if (process.argv[1]?.endsWith("changed-fields.ts")) {
  const r = changedFields({ name: "A", price: "30000", city: null, tags: ["x"] }, { name: "A", price: 30000, city: "", tags: ["x", "y"], phone: "1" });
  if (JSON.stringify(r) !== JSON.stringify(["tags", "phone"])) throw new Error(`changedFields: ${JSON.stringify(r)}`);
  console.log("changed-fields ok");
}

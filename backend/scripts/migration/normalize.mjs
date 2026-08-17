// The one canonicalizer both gates share.
//
// Two databases can hold the same value and hand it back in different clothes:
// a timestamptz arrives as a Date from one driver and "…+00:00" from the other,
// jsonb comes back with its keys in whatever order the storage chose, an enum
// and the text it was staged as are the same label. None of those are drift.
// Everything below reduces a value to the form where equal means equal — and
// nothing more, so a real difference still shows up as one.

/** Canonical, comparable form of a value read from either database. */
export function norm(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return `@${value.getTime()}`;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (Buffer.isBuffer(value)) return `0x${value.toString("hex")}`;
  if (typeof value === "string") {
    // ISO timestamp -> epoch, so "…Z" vs "…+00:00" vs a Date all agree.
    if (/^\d{4}-\d\d-\d\dT/.test(value)) {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) return `@${t}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(norm);
  if (typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = norm(value[k]);
    return out;
  }
  return value;
}

export const canon = (value) => JSON.stringify(norm(value));

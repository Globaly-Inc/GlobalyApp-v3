import type { CompareCourseItem } from "../search/types";

// The compare tray hands its selection to the new tab in the URL fragment (#items=JSON) — a link
// anyone can craft. Rebuild each entry from the fields we know, each checked for its type, so a
// wrong-typed field is dropped instead of reaching a `.map` or React's text rendering and
// crashing the page. An entry without a string id/slug/name is skipped.

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : v === null ? null : undefined);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v === null ? null : undefined);

export function compareItemsFromHash(hash: string): CompareCourseItem[] {
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get("items");
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((i): CompareCourseItem[] => {
    if (!i || typeof i !== "object") return [];
    const o = i as Record<string, unknown>;
    const id = str(o.id), slug = str(o.slug), name = str(o.name);
    if (id === undefined || slug === undefined || name === undefined) return [];
    const branches = Array.isArray(o.branches) ? o.branches.filter((b): b is string => typeof b === "string") : undefined;
    return [{
      id, slug, name,
      institutionName: str(o.institutionName),
      institutionLogoUrl: strOrNull(o.institutionLogoUrl),
      countryName: str(o.countryName),
      durationLabel: strOrNull(o.durationLabel),
      subjectArea: strOrNull(o.subjectArea),
      nextIntakeLabel: str(o.nextIntakeLabel),
      annualTuition: numOrNull(o.annualTuition),
      feeCurrency: str(o.feeCurrency),
      branches,
      level: strOrNull(o.level),
    }];
  });
}

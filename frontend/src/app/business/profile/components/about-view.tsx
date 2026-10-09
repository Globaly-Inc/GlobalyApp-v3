"use client";

// This view wants the description as PLAIN TEXT, and `/<[^>]*>/g` was a hand-rolled way to get
// it. React escapes a JSX child, so that regex was never load-bearing for safety — but a
// single-pass tag strip reads as a sanitiser, which is what CodeQL flagged, and it decodes no
// entities. ALLOWED_TAGS: [] asks the real parser for the text instead.
import DOMPurify from "isomorphic-dompurify";

import type { BusinessProfile } from "@/app/business/apis/types";
import { businessTypeLabel } from "../utils";

/** The About card's read mode: classification tiles above the description. */
export function AboutView({ profile, isInstitution }: Readonly<{ profile: BusinessProfile; isInstitution: boolean }>) {
  const tiles = [
    { label: "Category", value: profile.business_category_name },
    { label: "Type", value: businessTypeLabel(profile.business_type) },
    { label: "Ownership", value: isInstitution ? profile.institution_type : null },
  ].filter((t): t is { label: string; value: string } => Boolean(t.value));

  return (
    <div className="flex flex-col gap-4">
      {tiles.length > 0 && (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-muted/50 px-3 py-2.5">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</dt>
              <dd className="truncate text-sm font-semibold text-foreground" title={t.value}>{t.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {profile.description ? (
        <p className="max-w-[72ch] whitespace-pre-line text-sm leading-relaxed text-foreground sm:text-[15px]">
          {DOMPurify.sanitize(profile.description, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No description added yet.</p>
      )}
    </div>
  );
}

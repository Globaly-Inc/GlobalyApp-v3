"use client";

// This view wants the description as PLAIN TEXT, and `/<[^>]*>/g` was a hand-rolled way to get
// it. React escapes a JSX child, so that regex was never load-bearing for safety — but a
// single-pass tag strip reads as a sanitiser, which is what CodeQL flagged, and it decodes no
// entities. ALLOWED_TAGS: [] asks the real parser for the text instead.
import DOMPurify from "isomorphic-dompurify";

import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import type { BusinessProfile } from "@/app/business/apis/types";
import { businessTypeLabel } from "../utils";

/** The About card's read mode: classification fields above the description. */
export function AboutView({ profile, isInstitution }: Readonly<{ profile: BusinessProfile; isInstitution: boolean }>) {
  const tiles = [
    { label: "Category", value: profile.business_category_name },
    { label: "Type", value: businessTypeLabel(profile.business_type) },
    { label: "Ownership", value: isInstitution ? profile.institution_type : null },
  ].filter((t): t is { label: string; value: string } => Boolean(t.value));

  return (
    <div className="flex flex-col gap-5">
      {tiles.length > 0 && (
        <DescriptionList>
          {tiles.map((t) => (
            <DescriptionItem key={t.label} label={t.label}>{t.value}</DescriptionItem>
          ))}
        </DescriptionList>
      )}
      {profile.description ? (
        <p className="max-w-[72ch] whitespace-pre-line text-sm leading-relaxed text-foreground">
          {DOMPurify.sanitize(profile.description, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No description added yet.</p>
      )}
    </div>
  );
}

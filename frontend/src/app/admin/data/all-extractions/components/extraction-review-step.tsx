"use client";

import { SummaryRow } from "./summary-row";
import type { GuidedUrlCategory } from "../const";

const cleanUrls = (urls: string[] | undefined) => (urls ?? []).map((u) => u.trim()).filter(Boolean);

/** Step 3 of NewExtractionDialog — read-only summary of everything entered in steps 1-2. */
export function ExtractionReviewStep({
  businessLabel,
  serviceLabel,
  sourceTypeLabel,
  isVisaServiceSource,
  institutionUrl,
  sampleCourseUrl,
  guidedUrlCategories,
  guidedUrls,
  guidanceNotes,
}: Readonly<{
  businessLabel: string;
  serviceLabel: string;
  sourceTypeLabel: string;
  isVisaServiceSource: boolean;
  institutionUrl: string;
  sampleCourseUrl: string;
  guidedUrlCategories: readonly GuidedUrlCategory[];
  guidedUrls: Record<string, string[]>;
  guidanceNotes: string;
}>) {
  return (
    <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1 text-sm">
      <SummaryRow label="Business category" value={businessLabel} />
      <SummaryRow label="Service category" value={serviceLabel} />
      <SummaryRow label="Source type" value={sourceTypeLabel} />
      <SummaryRow
        label={isVisaServiceSource ? "Visa service provider website URL" : "Institution website URL"}
        value={institutionUrl.trim()}
      />
      <SummaryRow
        label={isVisaServiceSource ? "Sample service page URL" : "Sample course page URL"}
        value={sampleCourseUrl.trim()}
      />

      {guidedUrlCategories.map(({ key, label }) => (
        <SummaryRow key={key} label={`${label} page URLs`} value={cleanUrls(guidedUrls[key])} />
      ))}

      <SummaryRow label="Guidance for the AI" value={guidanceNotes.trim()} />
    </div>
  );
}

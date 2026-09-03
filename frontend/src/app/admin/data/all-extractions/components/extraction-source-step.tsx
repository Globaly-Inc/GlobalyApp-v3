"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UrlList } from "./url-list";
import type { GuidedUrlCategory } from "../const";

/** Step 2 of NewExtractionDialog — the seed URL + guided-URL fields, swapped between the
 * institution/course field set and the visa-service field set based on the chosen source type. */
export function ExtractionSourceStep({
  isVisaServiceSource,
  guidedUrlCategories,
  institutionUrl,
  onInstitutionUrlChange,
  sampleCourseUrl,
  onSampleCourseUrlChange,
  guidedUrls,
  onGuidedUrlsChange,
  guidanceNotes,
  onGuidanceNotesChange,
}: Readonly<{
  isVisaServiceSource: boolean;
  guidedUrlCategories: readonly GuidedUrlCategory[];
  institutionUrl: string;
  onInstitutionUrlChange: (next: string) => void;
  sampleCourseUrl: string;
  onSampleCourseUrlChange: (next: string) => void;
  guidedUrls: Record<string, string[]>;
  onGuidedUrlsChange: (next: Record<string, string[]>) => void;
  guidanceNotes: string;
  onGuidanceNotesChange: (next: string) => void;
}>) {
  return (
    <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        <Label htmlFor="institution-url">
          {isVisaServiceSource ? "Visa service provider website URL" : "Institution website URL"}
        </Label>
        <Input
          id="institution-url"
          type="url"
          placeholder={isVisaServiceSource ? "https://visaconsultancy.com" : "https://university.edu"}
          value={institutionUrl}
          onChange={(e) => onInstitutionUrlChange(e.target.value)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Everything below is optional — leave it blank and the AI discovers pages itself. Pointing it at
        the right pages gives markedly better results. Add as many URLs per section as you need.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sample-course-url">
          {isVisaServiceSource ? "Sample service page URL" : "Sample course page URL"}
        </Label>
        <Input
          id="sample-course-url"
          type="url"
          placeholder={
            isVisaServiceSource
              ? "https://visaconsultancy.com/services/skilled-migration"
              : "https://university.edu/courses/bachelor-of-science"
          }
          value={sampleCourseUrl}
          onChange={(e) => onSampleCourseUrlChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {isVisaServiceSource
            ? "One individual service page, so the AI learns the URL pattern."
            : "One individual course page, so the AI learns the URL pattern."}
        </p>
      </div>

      {guidedUrlCategories.map(({ key, label, ...rest }) => (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>{label} page URLs</Label>
          <UrlList
            id={key}
            values={guidedUrls[key] ?? []}
            onChange={(next) => onGuidedUrlsChange({ ...guidedUrls, [key]: next })}
          />
          {"hint" in rest && <p className="text-xs text-muted-foreground">{rest.hint}</p>}
        </div>
      ))}

      <div className="flex flex-col gap-2">
        <Label htmlFor="guidance-notes">Additional guidance for the AI</Label>
        <Textarea
          id="guidance-notes"
          rows={3}
          placeholder={
            isVisaServiceSource
              ? "e.g. Fees are listed in AUD per application. MARN numbers appear next to each agent's name."
              : "e.g. Fees are shown per semester — multiply by 2 for annual. CRICOS codes appear in the sidebar."
          }
          value={guidanceNotes}
          onChange={(e) => onGuidanceNotesChange(e.target.value)}
        />
      </div>
    </div>
  );
}

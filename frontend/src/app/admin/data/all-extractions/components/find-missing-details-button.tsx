"use client";

import { useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { allExtractionsApi } from "../apis";
import type { EditableTable, MissingDetailCandidate } from "../apis/types";

type Target =
  // Homepage + best-effort /contact scrape, text-extraction based.
  | { kind: "institution"; overviewId: string; jobId: string }
  // Geocodes the campus's existing address, no scraping involved.
  | { kind: "campus"; campusId: string; jobId?: string };

export type FindMissingDetailsButtonProps = Readonly<{
  target: Target;
  /** Re-fetches the job so an applied field shows up in the read-only view. */
  onApplied: () => void;
  /** Icon-only trigger for tight row layouts (e.g. a campus card's action row). */
  compact?: boolean;
}>;

const TABLE_FOR: Record<Target["kind"], EditableTable> = {
  institution: "extraction_institution_overview",
  campus: "extraction_campuses",
};

const LOADING_LABEL: Record<Target["kind"], string> = {
  institution: "Searching homepage & contact page…",
  campus: "Looking up address…",
};

const EMPTY_LABEL: Record<Target["kind"], string> = {
  institution: "Nothing found — every field is already filled or wasn't stated on the site.",
  campus: "Nothing found — postcode/map link are already filled, or there's no address to look up yet.",
};

/** "Find Missing Details" — looks up values for whichever fields are currently empty, then
 * lets the admin accept each one individually through the existing save-and-learn path, same
 * as any manual edit. Institution overview uses text extraction (scrapes homepage/contact);
 * campuses use geocoding against the address already on file. */
export function FindMissingDetailsButton({ target, onApplied, compact }: FindMissingDetailsButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState<MissingDetailCandidate[]>([]);
  const [applyingField, setApplyingField] = useState<string | null>(null);

  const recordId = target.kind === "institution" ? target.overviewId : target.campusId;

  const search = async () => {
    setLoading(true);
    try {
      const { fields } =
        target.kind === "institution"
          ? await allExtractionsApi.findMissingInstitutionDetails(target.jobId)
          : await allExtractionsApi.findMissingCampusDetails(target.campusId);
      setCandidates(fields);
      setSearched(true);
    } catch (e) {
      toast.error("Couldn't look up missing details", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const apply = async (candidate: MissingDetailCandidate) => {
    setApplyingField(candidate.field);
    try {
      await allExtractionsApi.saveAndLearn({
        table: TABLE_FOR[target.kind],
        id: recordId,
        patch: { [candidate.field]: candidate.value },
        job_id: target.jobId,
        source_url: candidate.source_url ?? undefined,
      });
      setCandidates((prev) => prev.filter((c) => c.field !== candidate.field));
      toast.success(`${candidate.label} saved`);
      onApplied();
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setApplyingField(null);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !searched) search();
      }}
    >
      <PopoverTrigger
        render={
          compact ? (
            <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Find Missing Details">
              <Search className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
              <Search className="h-3.5 w-3.5" />
              Find Missing Details
            </Button>
          )
        }
      />
      <PopoverContent align="end" className="w-80 p-3">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {LOADING_LABEL[target.kind]}
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{searched ? EMPTY_LABEL[target.kind] : ""}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {candidates.map((c) => (
              <div key={c.field} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                  <p className="truncate text-sm">{c.value}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 cursor-pointer"
                    disabled={applyingField === c.field}
                    onClick={() => apply(c)}
                    aria-label={`Apply ${c.label}`}
                  >
                    {applyingField === c.field ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 cursor-pointer"
                    disabled={applyingField === c.field}
                    onClick={() => setCandidates((prev) => prev.filter((x) => x.field !== c.field))}
                    aria-label={`Dismiss ${c.label}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

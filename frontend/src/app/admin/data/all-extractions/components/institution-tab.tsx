"use client";

import { useState } from "react";
import { Building2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allExtractionsApi } from "../apis";
import { EditableField } from "./editable-field";
import type { InstitutionOverview } from "../apis/types";

export type InstitutionTabProps = Readonly<{
  overview: InstitutionOverview | null;
  jobId: string;
  onReload: () => void;
}>;

function SectionLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function InstitutionTab({ overview, jobId, onReload }: InstitutionTabProps) {
  const [busy, setBusy] = useState(false);

  // Inline edits go through save-and-learn so corrections also train the extractor.
  const saveField = async (column: string, next: string | null) => {
    if (!overview) return;
    try {
      await allExtractionsApi.saveAndLearn({
        table: "extraction_institution_overview",
        id: overview.id,
        patch: { [column]: next },
        job_id: jobId,
      });
      toast.success("Saved");
      onReload();
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    }
  };

  const rerun = async () => {
    setBusy(true);
    try {
      await allExtractionsApi.runStep(jobId, "institution");
      toast.success("Institution re-extraction started", {
        description: "Running in the background — you can switch tabs.",
      });
      onReload();
    } catch (e) {
      toast.error("Re-run failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" className="gap-1.5 cursor-pointer" disabled={busy} onClick={rerun}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Re-run Institution Extraction
        </Button>
      </div>

      {overview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Institution Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-4">
              {overview.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- extracted logos are arbitrary remote hosts
                <img src={overview.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl border object-contain p-1" />
              )}
              <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
                <EditableField label="Name" value={overview.name} onSave={(v) => saveField("name", v)} />
                <EditableField label="Website" value={overview.website} onSave={(v) => saveField("website", v)} />
                <EditableField label="Logo URL" value={overview.logo_url} onSave={(v) => saveField("logo_url", v)} className="md:col-span-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
              <SectionLabel>Contact</SectionLabel>
              <EditableField label="Email" value={overview.email} onSave={(v) => saveField("email", v)} />
              <EditableField label="Phone" value={overview.phone} onSave={(v) => saveField("phone", v)} />
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
              <SectionLabel>Location</SectionLabel>
              <EditableField label="Country" value={overview.country} onSave={(v) => saveField("country", v)} />
              <EditableField label="City" value={overview.city} onSave={(v) => saveField("city", v)} />
              <EditableField label="State" value={overview.state} onSave={(v) => saveField("state", v)} />
              <EditableField label="Zip / Postcode" value={overview.zip_code} onSave={(v) => saveField("zip_code", v)} />
              <EditableField label="Address" value={overview.address} onSave={(v) => saveField("address", v)} multiline className="md:col-span-2" />
              <EditableField label="Description" value={overview.description} onSave={(v) => saveField("description", v)} multiline className="md:col-span-2" />
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
              <SectionLabel>Social Media</SectionLabel>
              <EditableField label="Facebook" value={overview.facebook_url} onSave={(v) => saveField("facebook_url", v)} />
              <EditableField label="Instagram" value={overview.instagram_url} onSave={(v) => saveField("instagram_url", v)} />
              <EditableField label="Twitter" value={overview.twitter_url} onSave={(v) => saveField("twitter_url", v)} />
              <EditableField label="LinkedIn" value={overview.linkedin_url} onSave={(v) => saveField("linkedin_url", v)} />
              <EditableField label="YouTube" value={overview.youtube_url} onSave={(v) => saveField("youtube_url", v)} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">No institution data extracted yet</p>
            <p className="mt-1 text-xs">Run the extraction above, or wait for the pipeline to populate it</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

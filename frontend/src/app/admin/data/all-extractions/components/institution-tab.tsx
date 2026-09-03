"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2, FileText, Globe, Hash, Image, Link2, Loader2, Mail, MapPin, Phone, Share2, Sparkles, Type,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { geoApi } from "@/app/geo/apis";
import { allExtractionsApi } from "../apis";
import { EditableField, type EditableFieldProps } from "./editable-field";
import type { InstitutionOverview } from "../apis/types";

export type InstitutionTabProps = Readonly<{
  overview: InstitutionOverview | null;
  jobId: string;
  onReload: () => void;
  /** Same extraction_institution_overview record for every job type — only the wording
   * changes here, since "Institution" read as if visa data had leaked into the wrong tab. */
  isVisaServiceJob?: boolean;
}>;

function Section({ icon: Icon, title, children }: Readonly<{ icon: LucideIcon; title: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{children}</div>
    </div>
  );
}

// EditableField already handles its own click-to-edit affordance — this just gives
// each field a visual anchor (icon tile) so the section doesn't read as bare text rows.
function Field({ icon: Icon, className, ...field }: Readonly<EditableFieldProps & { icon: LucideIcon }>) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <EditableField {...field} className="flex-1" />
    </div>
  );
}

/**
 * Variant of Field specifically for Country — shows a searchable Combobox
 * (populated from the platform countries list) when editing, instead of a raw text input.
 */
function EditableCountryField({
  value,
  onSave,
  className,
}: Readonly<{ value: string | null | undefined; onSave: (next: string | null) => Promise<unknown>; className?: string }>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [countries, setCountries] = useState<{ value: string; label: string }[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);

  const startEdit = () => {
    setDraft(value ?? "");
    setEditing(true);
    if (countries.length === 0) {
      setLoadingCountries(true);
      geoApi.getCountries()
        .then((list) => setCountries(list.map((c) => ({ value: c.name, label: c.name }))))
        .catch((e: Error) => toast.error("Could not load countries", { description: e.message }))
        .finally(() => setLoadingCountries(false));
    }
  };

  const commit = async (next: string) => {
    const val = next.trim() || null;
    if (val === (value ?? null)) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(val);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Globe className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Country</p>
            <div className="flex items-center gap-1">
              <Combobox
                options={countries}
                value={draft}
                onChange={(v) => { setDraft(v); commit(v); }}
                placeholder="Select country"
                loading={loadingCountries}
                disabled={saving}
                className="flex-1 h-9"
              />
              <Button
                variant="ghost" size="icon-sm"
                className="cursor-pointer shrink-0"
                title="Cancel"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-xs">✕</span>}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="group/field w-full rounded-md p-1 text-left transition-colors cursor-pointer hover:bg-muted/60"
          >
            <p className="text-xs text-muted-foreground">Country</p>
            <span className="mt-0.5 flex items-start justify-between gap-2">
              <span className={cn("text-sm break-words", !value && "text-muted-foreground")}>{value || "—"}</span>
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/field:opacity-100" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export function InstitutionTab({ overview, jobId, onReload, isVisaServiceJob }: InstitutionTabProps) {
  const [busy, setBusy] = useState(false);
  const noun = isVisaServiceJob ? "business" : "institution";

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
      toast.success(`${isVisaServiceJob ? "Business" : "Institution"} re-extraction started`, {
        description: "Running in the background — you can switch tabs.",
      });
      onReload();
    } catch (e) {
      toast.error("Re-run failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!overview) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm">No {noun} data extracted yet</p>
          <p className="mt-1 text-xs">Run the extraction below, or wait for the pipeline to populate it</p>
          <Button variant="outline" className="mt-4 gap-1.5 cursor-pointer" disabled={busy} onClick={rerun}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Run {isVisaServiceJob ? "Business" : "Institution"} Extraction
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="-mt-4 rounded-t-xl border-b bg-primary/5 px-4 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          {isVisaServiceJob ? "Business" : "Institution"} Details
        </CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" disabled={busy} onClick={rerun}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Re-run
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4">
          {overview.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- extracted logos are arbitrary remote hosts
            <img src={overview.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl border object-contain p-1" />
          )}
          <div className="grid flex-1 grid-cols-1 gap-2.5 md:grid-cols-2">
            <Field icon={Type} label="Name" value={overview.name} onSave={(v) => saveField("name", v)} />
            <Field icon={Globe} label="Website" value={overview.website} onSave={(v) => saveField("website", v)} />
            <Field icon={Image} label="Logo URL" value={overview.logo_url} onSave={(v) => saveField("logo_url", v)} className="md:col-span-2" />
          </div>
        </div>

        <Section icon={Mail} title="Contact">
          <Field icon={Mail} label="Email" value={overview.email} onSave={(v) => saveField("email", v)} />
          <Field icon={Phone} label="Phone" value={overview.phone} onSave={(v) => saveField("phone", v)} />
        </Section>

        <Section icon={MapPin} title="Location">
          <EditableCountryField value={overview.country} onSave={(v) => saveField("country", v)} />
          <Field icon={Building2} label="City" value={overview.city} onSave={(v) => saveField("city", v)} />
          <Field icon={MapPin} label="State" value={overview.state} onSave={(v) => saveField("state", v)} />
          <Field icon={Hash} label="Zip / Postcode" value={overview.zip_code} onSave={(v) => saveField("zip_code", v)} />
          <Field icon={MapPin} label="Address" value={overview.address} onSave={(v) => saveField("address", v)} multiline className="md:col-span-2" />
          <Field icon={FileText} label="Description" value={overview.description} onSave={(v) => saveField("description", v)} multiline className="md:col-span-2" />
        </Section>

        <Section icon={Share2} title="Social Media">
          <Field icon={Link2} label="Facebook" value={overview.facebook_url} onSave={(v) => saveField("facebook_url", v)} />
          <Field icon={Link2} label="Instagram" value={overview.instagram_url} onSave={(v) => saveField("instagram_url", v)} />
          <Field icon={Link2} label="Twitter" value={overview.twitter_url} onSave={(v) => saveField("twitter_url", v)} />
          <Field icon={Link2} label="LinkedIn" value={overview.linkedin_url} onSave={(v) => saveField("linkedin_url", v)} />
          <Field icon={Link2} label="YouTube" value={overview.youtube_url} onSave={(v) => saveField("youtube_url", v)} />
        </Section>
      </CardContent>
    </Card>
  );
}

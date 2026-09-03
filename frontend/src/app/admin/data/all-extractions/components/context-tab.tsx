"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import {
  Globe, FileText, Link2, Plus, Trash2, Loader2,
  FolderOpen, Download, Inbox, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { uuid } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { GUIDED_URL_CATEGORIES } from "../const";
import { SourceInformationCard } from "./source-information-card";
import type { ExtractionJob } from "../apis/types";

// ── Types ────────────────────────────────────────────────────────
interface GuidedUrls {
  extract_fields?: string[];
  resources?: Resource[];
  // One `<category>_urls: string[]` key per GUIDED_URL_CATEGORIES entry.
  [urlCategory: string]: string[] | Resource[] | undefined;
}

interface Resource {
  id: string;
  type: "file" | "url";
  url?: string;
  file_name?: string;
  file_path?: string;
  data_types?: string[];
  guidance?: string;
}

export type ContextTabProps = Readonly<{
  job: ExtractionJob;
  onReload: () => void;
}>;

const URL_CATEGORIES = GUIDED_URL_CATEGORIES;

const DATA_TYPE_OPTIONS = [
  "Fee Information", "Intake Dates", "Eligibility", "Course Details",
  "Accreditations", "Study Units", "Campus Information", "Scholarships", "Other",
];

const CARD_HEADER = "-mt-4 rounded-t-xl border-b bg-primary/5 px-4 py-4";

// Which pipeline step a guided-URL context feeds — the same steps the data tabs dispatch
// (courses-tab → discovery, fees-tab → enrichment, intakes/eligibility/units → courses, …).
const CONTEXT_STEP: Record<string, { step: string; label: string }> = {
  course_list_urls: { step: "discovery", label: "Course Discovery" },
  contact_urls: { step: "institution", label: "Institution" },
  branches_urls: { step: "branches", label: "Branches" },
  agents_urls: { step: "agents", label: "Agents" },
  fees_urls: { step: "enrichment", label: "Fees" },
  intakes_urls: { step: "courses", label: "Intakes" },
  eligibility_urls: { step: "courses", label: "Eligibility" },
  units_urls: { step: "courses", label: "Study Units" },
  accreditations_urls: { step: "courses", label: "Accreditations" },
};

export function ContextTab({ job, onReload }: ContextTabProps) {
  const jobId = job.id;
  const [saving, setSaving] = useState(false);

  // Add guided URL form
  const [newGuidedUrl, setNewGuidedUrl] = useState("");
  const [newGuidedCategory, setNewGuidedCategory] = useState<string>("course_list_urls");

  // Add resource form
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [newResourceDataType, setNewResourceDataType] = useState("");
  const [newResourceGuidance, setNewResourceGuidance] = useState("");

  const urls = (job.guided_urls ?? {}) as GuidedUrls;
  const resources = (urls.resources ?? []) as Resource[];
  const extractFields = urls.extract_fields ?? [];
  const docs = job.supporting_documents ?? [];

  async function saveGuidedUrls(updated: GuidedUrls) {
    setSaving(true);
    try {
      await allExtractionsApi.updateContext(jobId, { guided_urls: updated });
      toast.success("Saved");
      onReload();
    } catch (e: unknown) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddGuidedUrl() {
    if (!newGuidedUrl.trim()) return;
    const key = newGuidedCategory as keyof GuidedUrls;
    const existing = (urls[key] as string[] | undefined) ?? [];
    await saveGuidedUrls({ ...urls, [key]: [...existing, newGuidedUrl.trim()] });
    setNewGuidedUrl("");
  }

  async function handleRemoveGuidedUrl(category: string, index: number) {
    const existing = ((urls as Record<string, unknown>)[category] as string[] | undefined) ?? [];
    await saveGuidedUrls({ ...urls, [category]: existing.filter((_, i) => i !== index) });
  }

  async function handleAddResource() {
    if (!newResourceUrl.trim()) return;
    const newRes: Resource = {
      id: uuid(),
      type: "url",
      url: newResourceUrl.trim(),
      data_types: newResourceDataType ? [newResourceDataType] : [],
      guidance: newResourceGuidance.trim() || undefined,
    };
    await saveGuidedUrls({ ...urls, resources: [...resources, newRes] });
    setNewResourceUrl("");
    setNewResourceDataType("");
    setNewResourceGuidance("");
  }

  async function handleRemoveResource(resId: string) {
    await saveGuidedUrls({ ...urls, resources: resources.filter((r) => r.id !== resId) });
  }

  const [runningContext, setRunningContext] = useState<string | null>(null);

  async function handleRerunContext(key: string) {
    const mapped = CONTEXT_STEP[key];
    if (!mapped) return;
    setRunningContext(key);
    try {
      await allExtractionsApi.runStep(jobId, mapped.step);
      toast.success(`${mapped.label} extraction started`, { description: "Running in the background — you can switch tabs." });
      onReload();
    } catch (e: unknown) {
      toast.error("Run failed", { description: (e as Error).message });
    } finally {
      setRunningContext(null);
    }
  }

  return (
    <div className="space-y-6">
      <SourceInformationCard job={job} />

      {/* Extract Fields */}
      {extractFields.length > 0 && (
        <Card>
          <CardHeader className={CARD_HEADER}><CardTitle className="text-base">Extract Fields</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {extractFields.map((f) => (
                <Badge key={f} variant="secondary" className="capitalize">{f.replace(/_/g, " ")}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guided URLs */}
      <Card>
        <CardHeader className={CARD_HEADER}><CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />Guided URLs</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          {URL_CATEGORIES.map(({ key, label }) => {
            const items = (urls[key] as string[] | undefined) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                  {CONTEXT_STEP[key] && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs cursor-pointer"
                      disabled={runningContext !== null}
                      title={`Re-run the ${CONTEXT_STEP[key].label} extraction step using these URLs`}
                      onClick={() => handleRerunContext(key)}
                    >
                      {runningContext === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                      Re-run
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  {items.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2 group rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">{url}</a>
                      <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" onClick={() => handleRemoveGuidedUrl(key, idx)} disabled={saving}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Add Guided URL */}
          <div className="border-t pt-4">
            <p className="text-xs font-medium mb-2">Add Guided URL</p>
            <div className="flex items-end gap-2">
              <Combobox
                options={URL_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
                value={newGuidedCategory}
                onChange={setNewGuidedCategory}
                className="h-9 flex-1 text-xs"
              />
              <Input placeholder="https://..." value={newGuidedUrl} onChange={(e) => setNewGuidedUrl(e.target.value)} className="flex-1 h-9" />
              <Button size="sm" onClick={handleAddGuidedUrl} disabled={saving || !newGuidedUrl.trim()} className="gap-1 h-9">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resources & Documents */}
      <Card>
        <CardHeader className={CARD_HEADER}><CardTitle className="text-base flex items-center gap-2"><FolderOpen className="w-4 h-4 text-primary" />Resources & Documents</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {resources.length === 0 && docs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No resources or documents added yet</p>
            </div>
          )}

          {resources.map((res) => (
            <div key={res.id} className="flex items-start gap-3 p-3 rounded-lg border group hover:bg-muted/30 transition-colors">
              {res.type === "file" ? <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" /> : <Link2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{res.type}</Badge>
                  {res.type === "file" ? (
                    <span className="text-sm font-medium truncate">{res.file_name ?? "Uploaded file"}</span>
                  ) : (
                    <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">{res.url}</a>
                  )}
                </div>
                {res.data_types && res.data_types.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {res.data_types.map((dt) => <Badge key={dt} variant="outline" className="text-xs">{dt}</Badge>)}
                  </div>
                )}
                {res.guidance && <p className="text-xs text-muted-foreground">{res.guidance}</p>}
              </div>
              <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 shrink-0" onClick={() => handleRemoveResource(res.id)} disabled={saving}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}

          {docs.map((doc, idx) => (
            <div key={`doc-${idx}`} className="flex items-start gap-3 p-3 rounded-lg border">
              <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Document</Badge>
                  <span className="text-sm font-medium truncate">{doc.file_name}</span>
                </div>
                {doc.guidance && <p className="text-xs text-muted-foreground">{doc.guidance}</p>}
              </div>
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <Button variant="ghost" size="icon-sm"><Download className="w-3.5 h-3.5" /></Button>
              </a>
            </div>
          ))}

          {/* Add URL Resource */}
          {/* flex+gap, not space-y — see AGENTS.md on Combobox focus guards */}
          <div className="border-t pt-4 flex flex-col gap-3">
            <p className="text-xs font-medium">Add URL Resource</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input placeholder="https://..." value={newResourceUrl} onChange={(e) => setNewResourceUrl(e.target.value)} className="h-9" />
              <Combobox
                options={DATA_TYPE_OPTIONS.map((dt) => ({ value: dt, label: dt }))}
                value={newResourceDataType}
                onChange={setNewResourceDataType}
                placeholder="Data type..."
                className="h-9 w-full text-xs"
              />
              <Input placeholder="Guidance (optional)" value={newResourceGuidance} onChange={(e) => setNewResourceGuidance(e.target.value)} className="h-9" />
            </div>
            <Button size="sm" onClick={handleAddResource} disabled={saving || !newResourceUrl.trim()} className="gap-1 self-start">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Add Resource
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import {
  Globe, FileText, Link2, Plus, ExternalLink, Trash2, Loader2,
  Settings2, FolderOpen, Download,
} from "lucide-react";
import { toast } from "sonner";
import { uuid } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { GUIDED_URL_CATEGORIES } from "../const";
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

function SourceField({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

// Name when the category row resolves, the raw id when it doesn't, dash when unset.
function categoryValue(name: string | null | undefined, id: number | null | undefined) {
  if (name) return name;
  return id == null ? "—" : `#${id}`;
}

function SourceLink({ href }: Readonly<{ href: string }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-primary hover:underline"
    >
      <span className="truncate">{href}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

const URL_CATEGORIES = GUIDED_URL_CATEGORIES;

const DATA_TYPE_OPTIONS = [
  "Fee Information", "Intake Dates", "Eligibility", "Course Details",
  "Accreditations", "Study Units", "Campus Information", "Scholarships", "Other",
];

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

  return (
    <div className="space-y-6">
      {/* Source Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Source Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <SourceField label="Institution URL">
              <SourceLink href={job.institution_url} />
            </SourceField>
            <SourceField label="Source Type">
              <span className="capitalize">{job.source_type || "—"}</span>
            </SourceField>
            <SourceField label="Aggregator">{job.aggregator_name || "—"}</SourceField>
            <SourceField label="Business Category">
              {categoryValue(job.business_category_name, job.business_category_id)}
            </SourceField>
            <SourceField label="Service Category">
              {categoryValue(job.service_category_name, job.service_category_id)}
            </SourceField>
            {job.sample_course_url && (
              <SourceField label="Sample Course URL">
                <SourceLink href={job.sample_course_url} />
              </SourceField>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Extract Fields */}
      {extractFields.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Extract Fields</CardTitle></CardHeader>
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
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" />Guided URLs</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          {URL_CATEGORIES.map(({ key, label }) => {
            const items = (urls[key] as string[] | undefined) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
                <div className="space-y-1">
                  {items.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2 group">
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
                className="h-9 w-40 text-xs"
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
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FolderOpen className="w-4 h-4" />Resources & Documents</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {resources.length === 0 && docs.length === 0 && (
            <p className="text-sm text-muted-foreground">No resources or documents added yet</p>
          )}

          {resources.map((res) => (
            <div key={res.id} className="flex items-start gap-3 p-3 rounded-lg border group">
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

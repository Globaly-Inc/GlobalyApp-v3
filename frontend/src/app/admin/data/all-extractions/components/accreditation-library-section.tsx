"use client";

import { useState } from "react";
import { Award, Edit2, ExternalLink, Globe2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Textarea } from "@/components/ui/textarea";
import { allExtractionsApi } from "../apis";
import { useConfirmDelete } from "./use-confirm-delete";
import type { LibraryAccreditation, LibraryAccreditationInput } from "../apis/types";

function LibraryForm({
  initial, prefilledName, onSaved, onCancel,
}: Readonly<{
  initial?: LibraryAccreditation;
  prefilledName?: string;
  onSaved: (row: LibraryAccreditation) => void;
  onCancel: () => void;
}>) {
  const [form, setForm] = useState<LibraryAccreditationInput>({
    name: initial?.name ?? prefilledName ?? "",
    issuing_organization: initial?.issuing_organization ?? "",
    website: initial?.website ?? "",
    description: initial?.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof LibraryAccreditationInput, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      issuing_organization: form.issuing_organization || null,
      website: form.website || null,
      description: form.description || null,
    };
    try {
      const row = initial
        ? await allExtractionsApi.updateLibraryAccreditation(initial.id, payload)
        : await allExtractionsApi.createLibraryAccreditation(payload);
      toast.success("Saved");
      onSaved(row);
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Award className="h-4 w-4 text-primary" />{initial ? "Edit" : "Add"} Accreditation
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>Accreditations are <strong>global</strong> — once added, they can be assigned to any institution.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Name <span className="text-destructive">*</span></Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. AACSB" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Issuing Org</Label>
          <Input value={form.issuing_organization ?? ""} onChange={(e) => set("issuing_organization", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Website</Label>
          <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} type="url" placeholder="https://" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Description</Label>
          <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="gap-1.5 cursor-pointer" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" />{saving ? "Saving..." : initial ? "Update" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AccreditationLibrarySection({
  library, prefilledName, formOpen, onFormOpenChange, onChanged,
}: Readonly<{
  library: LibraryAccreditation[];
  /** Set when "Add new" was triggered from a scraped row — pre-fills the name. */
  prefilledName?: string;
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  onChanged: (saved?: LibraryAccreditation) => void;
}>) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<LibraryAccreditation | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { confirm, dialog } = useConfirmDelete();

  const q = search.trim().toLowerCase();
  const filtered = q
    ? library.filter((a) => a.name.toLowerCase().includes(q) || (a.issuing_organization ?? "").toLowerCase().includes(q))
    : library;
  // ponytail: client-side pagination — the whole library (≤500 rows) is already fetched
  // for the mapping combobox; go server-side if it ever outgrows that.
  const pageRows = filtered.slice((page - 1) * limit, page * limit);

  async function handleDelete(row: LibraryAccreditation) {
    if (!(await confirm(`Delete "${row.name}" from the library?`))) {
      return;
    }
    try {
      await allExtractionsApi.deleteLibraryAccreditation(row.id);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Globe2 className="h-4 w-4 text-primary" />
          Super-admin accreditation library
          <Badge variant="secondary" className="text-xs">{library.length}</Badge>
        </h3>
        <Button size="sm" className="gap-1.5 cursor-pointer" onClick={() => { setEditing(null); onFormOpenChange(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search library..."
        className="h-8 max-w-xs text-sm"
      />

      {formOpen && !editing && (
        <LibraryForm
          prefilledName={prefilledName}
          onSaved={(row) => { onFormOpenChange(false); onChanged(row); }}
          onCancel={() => onFormOpenChange(false)}
        />
      )}
      {editing && (
        <LibraryForm
          initial={editing}
          onSaved={() => { setEditing(null); onChanged(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {filtered.length === 0 && !formOpen && !editing ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Award className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{q ? "No matches" : "No accreditations in the library yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pageRows.map((acc) => (
            <Card key={acc.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{acc.name}</span>
                      <Badge className="gap-1 border-0 bg-primary/10 text-xs text-primary">
                        <Globe2 className="h-2.5 w-2.5" /> Global
                      </Badge>
                    </div>
                    {acc.issuing_organization && <p className="mt-0.5 text-xs text-muted-foreground">{acc.issuing_organization}</p>}
                    {acc.website && (
                      <a href={acc.website} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" />
                        {acc.website}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Edit" onClick={() => { onFormOpenChange(false); setEditing(acc); }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Delete" onClick={() => handleDelete(acc)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Pagination
            page={page}
            total={filtered.length}
            limit={limit}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setLimit(size); setPage(1); }}
            align="end"
          />
        </div>
      )}
    </div>
  );
}

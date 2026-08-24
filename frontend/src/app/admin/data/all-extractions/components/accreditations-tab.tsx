"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { allExtractionsApi } from "../apis";
import { useFieldSaver } from "./editable-field";
import { useConfirmDelete } from "./use-confirm-delete";
import { AccreditationLibrarySection } from "./accreditation-library-section";
import { ScrapedAccreditationCard } from "./scraped-accreditation-card";
import type { AccreditationAssignment, JobAccreditations, LibraryAccreditation } from "../apis/types";

function BulkMapDialog({
  open, onOpenChange, count, library, onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  library: LibraryAccreditation[];
  onConfirm: (accId: string) => Promise<void>;
}>) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) setSelected(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Map {count} scraped {count === 1 ? "row" : "rows"} to a library entry</DialogTitle>
          <DialogDescription>
            All selected scraped accreditations across this job will be linked to the same global library entry.
          </DialogDescription>
        </DialogHeader>
        {/* flex+gap, not space-y — see AGENTS.md on Combobox focus guards */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Library accreditation</Label>
          <Combobox
            options={library.map((a) => ({ value: a.id, label: a.name }))}
            value={selected}
            onChange={setSelected}
            placeholder="Select…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            size="sm" className="gap-1.5 cursor-pointer" disabled={!selected || saving}
            onClick={async () => {
              setSaving(true);
              try { await onConfirm(selected); onOpenChange(false); } finally { setSaving(false); }
            }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Apply mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccreditationsTab({ jobId }: Readonly<{ jobId: string }>) {
  const [data, setData] = useState<JobAccreditations>({ scraped: [], assignments: [] });
  const [library, setLibrary] = useState<LibraryAccreditation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [libraryFormOpen, setLibraryFormOpen] = useState(false);
  const [prefilledName, setPrefilledName] = useState<string | undefined>();
  const autoMapScrapedId = useRef<string | null>(null);
  const fetchedRef = useRef(false);
  const { confirm, dialog } = useConfirmDelete();

  async function load() {
    try {
      const [jobAcc, lib] = await Promise.all([
        allExtractionsApi.getJobAccreditations(jobId),
        allExtractionsApi.getAccreditationLibrary(),
      ]);
      setData(jobAcc);
      setLibrary(lib);
    } catch (e) {
      toast.error("Failed to load accreditations", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const saveField = useFieldSaver(jobId, load);

  const byScraped = useMemo(() => {
    const m = new Map<string, AccreditationAssignment[]>();
    for (const a of data.assignments) {
      if (!a.extraction_accreditation_id) continue;
      const arr = m.get(a.extraction_accreditation_id) ?? [];
      arr.push(a);
      m.set(a.extraction_accreditation_id, arr);
    }
    return m;
  }, [data.assignments]);

  const q = search.trim().toLowerCase();
  const filtered = q ? data.scraped.filter((s) => s.name.toLowerCase().includes(q)) : data.scraped;

  const unmappedCount = data.scraped.filter((s) => {
    const rows = byScraped.get(s.id) ?? [];
    return rows.length > 0 && rows.every((r) => !r.accreditation_id);
  }).length;

  async function applyMapping(scrapedIds: string[], accreditationId: string | null) {
    try {
      await allExtractionsApi.updateAccreditationMappings(jobId, scrapedIds, accreditationId);
      setData((prev) => ({
        ...prev,
        assignments: prev.assignments.map((a) =>
          a.extraction_accreditation_id && scrapedIds.includes(a.extraction_accreditation_id)
            ? { ...a, accreditation_id: accreditationId }
            : a,
        ),
      }));
      toast.success(accreditationId ? "Mapped" : "Mapping cleared");
    } catch (e) {
      toast.error("Mapping failed", { description: (e as Error).message });
    }
  }

  async function deleteScraped(id: string, name: string) {
    if (!(await confirm(`Delete scraped accreditation "${name}"?`))) return;
    try {
      await allExtractionsApi.deleteAccreditation(id);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    }
  }

  const visibleIds = filtered.map((s) => s.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading accreditations...</p>;

  return (
    <div className="space-y-6">
      {dialog}

      {/* ── Scraped from this job ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="h-4 w-4 text-primary" />
            Scraped from this job
            <Badge variant="secondary" className="text-xs">{data.scraped.length}</Badge>
          </h3>
          {unmappedCount > 0 && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertCircle className="h-3 w-3" />
              {unmappedCount} need mapping
            </Badge>
          )}
        </div>

        {data.scraped.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search scraped..." className="h-8 max-w-xs text-sm" />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={visibleIds.length === 0} />
              <span>Select all ({visibleIds.length})</span>
            </label>
            {selectedIds.size > 0 && (
              <Button size="sm" className="ml-auto gap-1.5 cursor-pointer" onClick={() => setBulkOpen(true)}>
                Map {selectedIds.size} to library…
              </Button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <Link2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {q
                  ? "No matches"
                  : "No scraped accreditations linked to courses in this job yet. Run the Course Data Extraction step from the action bar above."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <ScrapedAccreditationCard
                key={s.id}
                scraped={s}
                rows={byScraped.get(s.id) ?? []}
                library={library}
                selected={selectedIds.has(s.id)}
                onToggleSelected={() =>
                  setSelectedIds((prev) => {
                    const n = new Set(prev);
                    if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                    return n;
                  })
                }
                onMap={(accId) => applyMapping([s.id], accId)}
                onAddNew={() => {
                  autoMapScrapedId.current = s.id;
                  setPrefilledName(s.name);
                  setLibraryFormOpen(true);
                }}
                onSaveField={(column, value) => saveField("extraction_accreditations", s.id, column, value)}
                onDelete={() => deleteScraped(s.id, s.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Library ── */}
      <AccreditationLibrarySection
        library={library}
        prefilledName={prefilledName}
        formOpen={libraryFormOpen}
        onFormOpenChange={(open) => {
          setLibraryFormOpen(open);
          if (!open) { setPrefilledName(undefined); autoMapScrapedId.current = null; }
        }}
        onChanged={async (saved) => {
          // "Add new" from a scraped row: map that row to the entry just created.
          if (saved && autoMapScrapedId.current) {
            await applyMapping([autoMapScrapedId.current], saved.id);
            autoMapScrapedId.current = null;
          }
          setPrefilledName(undefined);
          const lib = await allExtractionsApi.getAccreditationLibrary();
          setLibrary(lib);
        }}
      />

      <BulkMapDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        count={selectedIds.size}
        library={library}
        onConfirm={async (accId) => {
          await applyMapping([...selectedIds], accId);
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}

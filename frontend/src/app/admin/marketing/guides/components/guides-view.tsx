"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, ImageOff, Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDeleteDialog } from "@/app/admin/components/confirm-delete-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchGuides, removeGuide, togglePublish } from "../store/guides-slice";
import type { GuideWithLeadCount } from "../apis/types";
import { GuideForm } from "./guide-form";

function GuideCard({
  guide,
  onEdit,
  onDelete,
  onTogglePublish,
}: Readonly<{
  guide: GuideWithLeadCount;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: (next: boolean) => void;
}>) {
  const thumb = guide.pdf_cover_image_url ?? guide.background_image_url;
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {guide.country && <Badge variant="outline">{guide.country}</Badge>}
          <Badge variant={guide.is_published ? "default" : "secondary"}>{guide.is_published ? "Published" : "Draft"}</Badge>
          {!guide.pdf_url && (
            <Badge variant="outline" className="text-muted-foreground">No PDF yet</Badge>
          )}
        </div>
        <p className="truncate text-sm font-semibold text-foreground">{guide.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {guide.lead_count} leads</span>
          {guide.pdf_url && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> PDF</span>}
          <span>/guides/{guide.slug}</span>
        </div>
      </div>

      <Switch checked={guide.is_published} onCheckedChange={onTogglePublish} aria-label="Published" />
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function GuidesView() {
  const dispatch = useAppDispatch();
  const { guides, status } = useAppSelector((state) => state.marketingGuides);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<GuideWithLeadCount | null | "new">(null);
  const [deleting, setDeleting] = useState<{ id: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const deletingRef = useRef(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchGuides());
  }, [dispatch]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return guides;
    return guides.filter((g) => g.title.toLowerCase().includes(needle));
  }, [guides, search]);

  async function handleConfirmDelete() {
    if (!deleting || deletingRef.current) return;
    deletingRef.current = true;
    setBusy(true);
    const result = await dispatch(removeGuide(deleting.id));
    deletingRef.current = false;
    setBusy(false);
    if (result.meta.requestStatus === "rejected") {
      toast.error("Something went wrong", { description: "Please try again." });
      return;
    }
    toast.success("Guide deleted");
    setDeleting(null);
  }

  async function handleTogglePublish(guide: GuideWithLeadCount, next: boolean) {
    const result = await dispatch(togglePublish({ id: guide.id, is_published: next }));
    if (result.meta.requestStatus === "rejected") toast.error("Failed to update publish state.");
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Guides</h1>
          <p className="mt-1 text-muted-foreground">{guides.length} total guides</p>
        </div>
        <Button className="h-10 gap-1.5" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          New Guide
        </Button>
      </div>

      <div className="mb-4 relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search guides..." className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {status === "loading" && guides.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No guides yet.</p>
          ) : (
            filtered.map((guide) => (
              <GuideCard
                key={guide.id}
                guide={guide}
                onEdit={() => setEditing(guide)}
                onDelete={() => setDeleting({ id: guide.id, title: guide.title })}
                onTogglePublish={(next) => handleTogglePublish(guide, next)}
              />
            ))
          )}
        </div>
      )}

      <GuideForm
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        guide={editing === "new" || editing === null ? null : editing}
      />

      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        name={deleting?.title ?? ""}
        onConfirm={handleConfirmDelete}
        deleting={busy}
      />
    </div>
  );
}

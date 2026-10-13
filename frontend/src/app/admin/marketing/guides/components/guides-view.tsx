"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/app/admin/components/confirm-delete-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchGuides, removeGuide, togglePublish } from "../store/guides-slice";
import type { GuideWithLeadCount } from "../apis/types";
import { GuideForm } from "./guide-form";
import { GUIDE_COLUMNS, GuideRow } from "./guide-row";

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
    <PageBody>
      <PageHeader title={<><BookOpen /> Guides</>} subtitle={`${guides.length} total guides`}>
        <Button className="h-10 gap-1.5" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          New Guide
        </Button>
      </PageHeader>

      <FilterBar>
        <SearchInput placeholder="Search guides" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {filtered.length} guide{filtered.length === 1 ? "" : "s"}
        </span>
      </FilterBar>

      {status === "loading" && guides.length === 0 ? (
        <ListSkeleton count={6} itemClassName="h-16" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No guides yet." />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {GUIDE_COLUMNS.map((col) => (
                  <TableHead key={col.label} numeric={"numeric" in col} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((guide) => (
                <GuideRow
                  key={guide.id}
                  guide={guide}
                  onEdit={() => setEditing(guide)}
                  onDelete={() => setDeleting({ id: guide.id, title: guide.title })}
                  onTogglePublish={(next) => handleTogglePublish(guide, next)}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
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
    </PageBody>
  );
}

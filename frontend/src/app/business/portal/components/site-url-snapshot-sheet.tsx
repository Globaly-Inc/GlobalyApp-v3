"use client";

import { useState } from "react";
import { Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { businessApi } from "../../apis";
import type { SiteUrlSnapshot } from "../../apis/types";

/** The "View" side sheet: the stored scraped markdown for one page, editable unless view-only. */
export function SiteUrlSnapshotSheet({
  snapshot,
  onSnapshotChange,
  viewOnly,
}: Readonly<{
  snapshot: SiteUrlSnapshot | null;
  onSnapshotChange: (next: SiteUrlSnapshot | null) => void;
  viewOnly: boolean;
}>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    if (!snapshot) return;
    setDraft(snapshot.markdown);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!snapshot) return;
    setSaving(true);
    try {
      const updated = await businessApi.updateExtractionSiteUrlSnapshot(snapshot.url, draft);
      onSnapshotChange(updated);
      setEditing(false);
      const re = updated.reExtraction;
      if (re?.outcome === "shared_page") {
        toast.success("Page content updated", {
          description: `This page lists ${re.courseCount} courses — too many to re-extract automatically; please update them individually.`,
        });
      } else if (re && re.failedCount > 0) {
        // Some of the courses sharing this page couldn't be queued — say so explicitly rather
        // than a plain success, since those still hold the old extraction until re-saved.
        toast.warning("Page content updated", {
          description: re.courseCount > 0
            ? `${re.courseCount} course${re.courseCount === 1 ? "" : "s"} refreshed, but ${re.failedCount} couldn't be queued — edit and save this page again to retry ${re.failedCount === 1 ? "it" : "them"}.`
            : `Couldn't queue re-extraction for ${re.failedCount} course${re.failedCount === 1 ? "" : "s"} sharing this page — edit and save this page again to retry.`,
        });
      } else if (re?.outcome === "triggered" && re.courseCount > 1) {
        toast.success("Page content updated", {
          description: `${re.courseCount} courses on this page are being refreshed from your correction.`,
        });
      } else {
        toast.success("Page content updated");
      }
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={snapshot !== null} onOpenChange={(open) => { if (!open) { onSnapshotChange(null); setEditing(false); } }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <div className="flex min-w-0 items-center gap-2">
              <SheetTitle className="truncate text-sm">{snapshot?.url}</SheetTitle>
              {snapshot?.edited && <Badge variant="secondary" className="shrink-0">Manually edited</Badge>}
            </div>
            {!editing && !viewOnly && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={startEditing}
                aria-label="Edit this page's content"
                title="Edit this page's content"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
          <SheetDescription>
            {editing
              ? "Editing stops this page from being refreshed by a future crawl, until you edit it again."
              : `What we extracted · fetched ${snapshot ? new Date(snapshot.scraped_at).toLocaleString() : ""} · ${snapshot?.markdown.length.toLocaleString()} characters`}
          </SheetDescription>
        </SheetHeader>
        {editing ? (
          <div className="mx-4 mb-4 flex flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[50vh] font-mono text-[11px] leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" className="gap-1.5" disabled={saving || draft.trim().length === 0} onClick={saveEdit}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <pre className="mx-4 mb-4 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
            {snapshot?.markdown}
          </pre>
        )}
      </SheetContent>
    </Sheet>
  );
}

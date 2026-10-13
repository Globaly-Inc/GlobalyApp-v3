"use client";

import type { Dispatch, SetStateAction } from "react";
import { Brain, CalendarClock, FileText, Loader2, Pencil, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { aiKnowledgeApi } from "../apis";
import { CRAWL_FREQUENCY_OPTIONS, CRAWL_STATUS_TONE, TRUST_TIER_OPTIONS, TRUST_TIER_TONE } from "../const";
import type { RackDocument, RackSource } from "../apis/types";
import type { useConfirmDelete } from "./use-confirm-delete";

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * Verification state of a source. Red beats amber: a figure past its stated validity
 * is wrong now, where an unverified one is only unconfirmed.
 */
function freshness(source: RackSource): { label: string; tone: string } | null {
  if (source.effective_until && new Date(source.effective_until) < new Date()) {
    return { label: `Expired ${source.effective_until}`, tone: "bg-destructive/15 text-destructive" };
  }
  if (!source.last_verified_at) {
    return { label: "Never verified", tone: "bg-warning/15 text-warning" };
  }
  if (Date.now() - new Date(source.last_verified_at).getTime() > SIX_MONTHS_MS) {
    return {
      label: `Verified ${new Date(source.last_verified_at).toLocaleDateString()}`,
      tone: "bg-warning/15 text-warning",
    };
  }
  return null;
}

/** One source row in the rack's source list, moved out of rack-tab.tsx verbatim. */
export function RackSourceCard({
  source, selected, documents, saving, confirm, run, expandedSourceId, setExpandedSourceId,
  setEditingSourceId, setAddingSource, setOpenDocumentId, onReloadSources, onReloadDocuments,
}: Readonly<{
  source: RackSource;
  selected: { id: string };
  documents: RackDocument[];
  saving: boolean;
  confirm: ReturnType<typeof useConfirmDelete>["confirm"];
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => Promise<void>;
  expandedSourceId: string | null;
  setExpandedSourceId: Dispatch<SetStateAction<string | null>>;
  setEditingSourceId: Dispatch<SetStateAction<string | null>>;
  setAddingSource: Dispatch<SetStateAction<boolean>>;
  setOpenDocumentId: Dispatch<SetStateAction<string | null>>;
  onReloadSources: (categoryId: string) => void;
  onReloadDocuments: (sourceId: string) => void;
}>) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium text-foreground">{source.title || source.domain}</p>
              <Badge className={`text-xs ${TRUST_TIER_TONE[source.trust_tier]}`}>
                {TRUST_TIER_OPTIONS.find((t) => t.value === source.trust_tier)?.label}
              </Badge>
              {source.last_status && (
                <Badge className={`text-xs ${CRAWL_STATUS_TONE[source.last_status]?.className ?? "bg-muted text-muted-foreground"}`}>
                  {CRAWL_STATUS_TONE[source.last_status]?.label ?? source.last_status}
                </Badge>
              )}
              {(() => {
                const stale = freshness(source);
                return stale ? (
                  <Badge className={`gap-1 text-xs ${stale.tone}`}>
                    <CalendarClock className="h-3 w-3" />
                    {stale.label}
                  </Badge>
                ) : null;
              })()}
              {source.source_type === "file" && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Upload className="h-3 w-3" />
                  Upload
                </Badge>
              )}
              {!source.active && <Badge className="bg-muted text-xs text-muted-foreground">Inactive</Badge>}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {source.source_type === "file" ? source.file_name : source.url}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {source.doc_count} document{source.doc_count === 1 ? "" : "s"}
              </span>
              {source.source_type !== "file" && (
                <span>
                  {CRAWL_FREQUENCY_OPTIONS.find((f) => f.value === source.crawl_frequency)?.label}
                </span>
              )}
              <span>
                {source.source_type === "file" ? "Uploaded" : "Last crawled"}:{" "}
                {source.last_crawled_at ? new Date(source.last_crawled_at).toLocaleString() : "Never"}
              </span>
            </div>
            {source.last_error && (
              <p className="mt-1 text-xs text-destructive">{source.last_error}</p>
            )}
            {source.crawl_summary && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last run: {source.crawl_summary.added} added · {source.crawl_summary.updated} updated ·{" "}
                {source.crawl_summary.unchanged} unchanged · {source.crawl_summary.failed} failed ·{" "}
                {source.crawl_summary.chunks ?? 0} chunks, {source.crawl_summary.embedded} embedded (via{" "}
                {source.crawl_summary.discovery_method})
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost" size="icon-sm" className="cursor-pointer"
              title={source.last_verified_at
                ? `Last verified ${new Date(source.last_verified_at).toLocaleString()} — confirm again`
                : "Mark as verified — you have confirmed this content is still true"}
              disabled={saving}
              onClick={() => run(
                () => aiKnowledgeApi.verifySource(source.id),
                "Marked as verified", () => onReloadSources(selected.id),
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </Button>
            {source.source_type !== "file" && (
            <Button
              variant="outline" className="gap-1.5 px-3 cursor-pointer"
              disabled={saving || source.last_status === "queued" || source.last_status === "crawling"}
              onClick={() => run(
                () => aiKnowledgeApi.crawlSource(source.id),
                "Crawl queued", () => onReloadSources(selected.id),
              )}
            >
              {source.last_status === "queued" || source.last_status === "crawling" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Crawl
            </Button>
            )}
            <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Edit" onClick={() => { setEditingSourceId(source.id); setAddingSource(false); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon-sm" title="Delete"
              className="cursor-pointer text-destructive hover:text-destructive"
              onClick={async () => {
                if (!(await confirm(`Delete ${source.domain} and its documents?`))) return;
                run(() => aiKnowledgeApi.deleteSource(source.id), "Source deleted", () => onReloadSources(selected.id));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          className="h-7 w-fit gap-1 px-2 text-xs text-muted-foreground cursor-pointer"
          onClick={() => {
            const next = expandedSourceId === source.id ? null : source.id;
            setExpandedSourceId(next);
            if (next) onReloadDocuments(next);
          }}
        >
          <FileText className="h-3 w-3" />
          {expandedSourceId === source.id ? "Hide documents" : "View documents"}
        </Button>

        {expandedSourceId === source.id && (
          <div className="space-y-1.5 border-t border-border pt-3">
            {documents.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No documents yet — run a crawl to populate this source.
              </p>
            )}
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => setOpenDocumentId(doc.id)}
                >
                  <p className="truncate text-sm">{doc.title || doc.url}</p>
                  <p className="truncate text-xs text-muted-foreground">{doc.word_count} words · {doc.url}</p>
                </button>
                <Badge
                  className={cn(
                    "shrink-0 gap-1 text-xs",
                    doc.is_embedded ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Brain className="h-3 w-3" />
                  {doc.is_embedded ? "In brain" : "Not embedded"}
                </Badge>
                <Button
                  variant="ghost" size="icon-xs" title="Delete document"
                  className="shrink-0 cursor-pointer text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!(await confirm("Delete this document?"))) return;
                    run(() => aiKnowledgeApi.deleteDocument(doc.id), "Document deleted", () => {
                      onReloadDocuments(source.id);
                      onReloadSources(selected.id);
                    });
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

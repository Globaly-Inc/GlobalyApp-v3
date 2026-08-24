"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain, CalendarClock, FileText, Library, Link2, Loader2, Pencil, Plus, RefreshCw, ShieldCheck,
  Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { aiKnowledgeApi } from "../apis";
import {
  CRAWL_FREQUENCY_OPTIONS, CRAWL_STATUS_TONE, TRUST_TIER_OPTIONS, TRUST_TIER_TONE,
} from "../const";
import type { RackCategory, RackDocument, RackSource } from "../apis/types";
import { CategoryForm } from "./category-form";
import { useConfirmDelete } from "./use-confirm-delete";
import { SourceForm } from "./source-form";
import { UploadSourceForm } from "./upload-source-form";
import { EmptyState, ListSkeleton } from "./shared";
import { DocumentDrawer } from "./document-drawer";

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * Verification state of a source. Red beats amber: a figure past its stated validity
 * is wrong now, where an unverified one is only unconfirmed.
 */
function freshness(source: RackSource): { label: string; tone: string } | null {
  if (source.effective_until && new Date(source.effective_until) < new Date()) {
    return { label: `Expired ${source.effective_until}`, tone: "bg-red-100 text-red-800" };
  }
  if (!source.last_verified_at) {
    return { label: "Never verified", tone: "bg-amber-100 text-amber-900" };
  }
  if (Date.now() - new Date(source.last_verified_at).getTime() > SIX_MONTHS_MS) {
    return {
      label: `Verified ${new Date(source.last_verified_at).toLocaleDateString()}`,
      tone: "bg-amber-100 text-amber-900",
    };
  }
  return null;
}

export function RackTab({
  categories, sources, documents, loading, onReloadCategories, onReloadSources, onReloadDocuments,
  selectedCategoryId, onSelectCategory,
}: Readonly<{
  categories: RackCategory[];
  sources: RackSource[];
  documents: RackDocument[];
  loading: boolean;
  onReloadCategories: () => void;
  onReloadSources: (categoryId: string) => void;
  onReloadDocuments: (sourceId: string) => void;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
}>) {
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirmDelete();

  // A queued or running crawl finishes out of band, so poll while one is in flight.
  const crawling = sources.some((s) => s.last_status === "queued" || s.last_status === "crawling");
  useEffect(() => {
    if (!crawling || !selectedCategoryId) return;
    const id = setInterval(() => onReloadSources(selectedCategoryId), 5000);
    return () => clearInterval(id);
  }, [crawling, selectedCategoryId, onReloadSources]);

  const run = useCallback(async (action: () => Promise<unknown>, success: string, after?: () => void) => {
    setSaving(true);
    try {
      await action();
      toast.success(success);
      after?.();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }, []);

  const selected = categories.find((c) => c.id === selectedCategoryId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {dialog}

      {/* ── Category sidebar ── */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Categories</p>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Add category" onClick={() => setAddingCategory(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {addingCategory && (
          <CategoryForm
            saving={saving}
            onCancel={() => setAddingCategory(false)}
            onSave={(values) => run(
              async () => { await aiKnowledgeApi.createCategory(values); setAddingCategory(false); },
              "Category created", onReloadCategories,
            )}
          />
        )}

        {categories.length === 0 && !addingCategory && (
          <p className="py-6 text-center text-xs text-muted-foreground">No categories yet.</p>
        )}

        {categories.map((category) =>
          editingCategoryId === category.id ? (
            <CategoryForm
              key={category.id}
              category={category}
              saving={saving}
              onCancel={() => setEditingCategoryId(null)}
              onSave={(values) => run(
                async () => { await aiKnowledgeApi.updateCategory(category.id, values); setEditingCategoryId(null); },
                "Category updated", onReloadCategories,
              )}
            />
          ) : (
            <div
              key={category.id}
              className={cn(
                "group/cat flex items-center justify-between gap-1 rounded-md px-2 py-1.5 transition-colors",
                selectedCategoryId === category.id ? "bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectCategory(category.id)}
                className="min-w-0 flex-1 cursor-pointer text-left"
              >
                <p className={cn("truncate text-sm", selectedCategoryId === category.id && "font-medium text-primary")}>
                  {category.label}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {category.kind.replaceAll("_", " ")}{category.country_code ? ` · ${category.country_code}` : ""}
                </p>
              </button>
              <div className="flex shrink-0 opacity-0 transition-opacity group-hover/cat:opacity-100">
                <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Edit" onClick={() => setEditingCategoryId(category.id)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost" size="icon-xs" title="Delete"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!(await confirm(`Delete "${category.label}" and all its sources?`))) return;
                    run(() => aiKnowledgeApi.deleteCategory(category.id), "Category deleted", onReloadCategories);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ),
        )}
      </div>

      {/* ── Source list ── */}
      <div className="space-y-3">
        {!selected ? (
          <EmptyState icon={Library} title="Select a category to view its sources" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{selected.label}</p>
                <p className="text-sm text-muted-foreground">
                  {sources.length} source{sources.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" className="gap-1.5 cursor-pointer" disabled={uploadingSource}
                  onClick={() => { setUploadingSource(true); setAddingSource(false); setEditingSourceId(null); }}
                >
                  <Upload className="h-4 w-4" />
                  Upload document
                </Button>
                <Button className="gap-1.5 cursor-pointer" disabled={addingSource} onClick={() => { setAddingSource(true); setUploadingSource(false); setEditingSourceId(null); }}>
                  <Plus className="h-4 w-4" />
                  Add source
                </Button>
              </div>
            </div>

            {uploadingSource && (
              <UploadSourceForm
                categoryId={selected.id}
                onCancel={() => setUploadingSource(false)}
                onDone={() => { setUploadingSource(false); onReloadSources(selected.id); }}
              />
            )}

            {addingSource && (
              <SourceForm
                categoryId={selected.id}
                saving={saving}
                onCancel={() => setAddingSource(false)}
                onSave={(values) => run(
                  async () => { await aiKnowledgeApi.createSource(values); setAddingSource(false); },
                  "Source added", () => onReloadSources(selected.id),
                )}
              />
            )}

            {loading && <ListSkeleton rows={3} />}

            {!loading && sources.length === 0 && !addingSource && !uploadingSource && (
              <EmptyState icon={Link2} title="No sources yet" hint="Add a page to crawl, or upload a PDF/MD/TXT document." />
            )}

            {sources.map((source) =>
              editingSourceId === source.id ? (
                <SourceForm
                  key={source.id}
                  source={source}
                  categoryId={selected.id}
                  saving={saving}
                  onCancel={() => setEditingSourceId(null)}
                  onSave={(values) => run(
                    async () => { await aiKnowledgeApi.updateSource(source.id, values); setEditingSourceId(null); },
                    "Source updated", () => onReloadSources(selected.id),
                  )}
                />
              ) : (
                <Card key={source.id}>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-foreground">{source.title || source.domain}</p>
                          <Badge className={`text-[10px] ${TRUST_TIER_TONE[source.trust_tier]}`}>
                            {TRUST_TIER_OPTIONS.find((t) => t.value === source.trust_tier)?.label}
                          </Badge>
                          {source.last_status && (
                            <Badge className={`text-[10px] ${CRAWL_STATUS_TONE[source.last_status]?.className ?? "bg-muted text-muted-foreground"}`}>
                              {CRAWL_STATUS_TONE[source.last_status]?.label ?? source.last_status}
                            </Badge>
                          )}
                          {(() => {
                            const stale = freshness(source);
                            return stale ? (
                              <Badge className={`gap-1 text-[10px] ${stale.tone}`}>
                                <CalendarClock className="h-3 w-3" />
                                {stale.label}
                              </Badge>
                            ) : null;
                          })()}
                          {source.source_type === "file" && (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Upload className="h-3 w-3" />
                              Upload
                            </Badge>
                          )}
                          {!source.active && <Badge className="bg-muted text-[10px] text-muted-foreground">Inactive</Badge>}
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
                          <p className="mt-1 text-[11px] text-muted-foreground">
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
                              <p className="truncate text-[10px] text-muted-foreground">{doc.word_count} words · {doc.url}</p>
                            </button>
                            <Badge
                              className={cn(
                                "shrink-0 gap-1 text-[10px]",
                                doc.is_embedded ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground",
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
              ),
            )}
          </>
        )}
      </div>

      <DocumentDrawer documentId={openDocumentId} onClose={() => setOpenDocumentId(null)} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain, FileText, Library, Link2, Loader2, Pencil, Plus, RefreshCw, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { aiKnowledgeApi } from "../apis";
import {
  CATEGORY_KIND_OPTIONS, CRAWL_FREQUENCY_OPTIONS, CRAWL_STATUS_TONE, TRUST_TIER_OPTIONS, TRUST_TIER_TONE,
} from "../const";
import type {
  CategoryKind, CategoryParams, CrawlFrequency, RackCategory, RackDocument,
  RackSource, SourceParams, TrustTier,
} from "../apis/types";
import { useConfirmDelete } from "./use-confirm-delete";
import { EmptyState, ListSkeleton } from "./shared";
import { DocumentDrawer } from "./document-drawer";

function CategoryForm({
  category, saving, onCancel, onSave,
}: Readonly<{ category?: RackCategory; saving: boolean; onCancel: () => void; onSave: (v: CategoryParams) => void }>) {
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [label, setLabel] = useState(category?.label ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "visa");
  const [country, setCountry] = useState(category?.country_code ?? "");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Label *</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Australia — Visa" className="h-8 text-xs" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Slug *</Label>
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="au-visa" className="h-8 text-xs" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Kind</Label>
        <Combobox
          options={CATEGORY_KIND_OPTIONS}
          value={kind}
          onChange={(v) => setKind(v as CategoryKind)}
          className="h-8 cursor-pointer text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Country code</Label>
        <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} placeholder="AU" className="h-8 text-xs" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 cursor-pointer text-xs" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm" className="h-7 cursor-pointer text-xs" disabled={saving}
          onClick={() => {
            if (!label.trim() || !slug.trim()) { toast.error("Label and slug are required"); return; }
            onSave({
              label: label.trim(), slug: slug.trim(), kind,
              country_code: country.trim() ? country.trim() : null,
            });
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function SourceForm({
  source, categoryId, saving, onCancel, onSave,
}: Readonly<{
  source?: RackSource; categoryId: string; saving: boolean;
  onCancel: () => void; onSave: (v: SourceParams) => void;
}>) {
  const [url, setUrl] = useState(source?.url ?? "");
  const [title, setTitle] = useState(source?.title ?? "");
  const [trustTier, setTrustTier] = useState<TrustTier>(source?.trust_tier ?? "other");
  const [frequency, setFrequency] = useState<CrawlFrequency>(source?.crawl_frequency ?? "monthly");
  const [maxPages, setMaxPages] = useState(String(source?.max_pages ?? ""));
  const [active, setActive] = useState(source?.active ?? true);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="font-semibold text-foreground">{source ? "Edit source" : "New source"}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>URL *</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://immi.homeaffairs.gov.au/visas/student" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Student visa hub" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Trust tier</Label>
            <Combobox
              options={TRUST_TIER_OPTIONS}
              value={trustTier}
              onChange={(v) => setTrustTier(v as TrustTier)}
              className="cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Crawl frequency</Label>
            <Combobox
              options={CRAWL_FREQUENCY_OPTIONS}
              value={frequency}
              onChange={(v) => setFrequency(v as CrawlFrequency)}
              className="cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max pages per crawl</Label>
            <Input type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} placeholder="25" />
          </div>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          Active
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            className="cursor-pointer" disabled={saving}
            onClick={() => {
              if (!url.trim()) { toast.error("URL is required"); return; }
              onSave({
                category_id: categoryId, url: url.trim(), title: title.trim() || null,
                trust_tier: trustTier, crawl_frequency: frequency,
                max_pages: maxPages.trim() ? Number(maxPages) : null, active,
              });
            }}
          >
            {source ? "Save changes" : "Add source"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
              <Button className="gap-1.5 cursor-pointer" disabled={addingSource} onClick={() => { setAddingSource(true); setEditingSourceId(null); }}>
                <Plus className="h-4 w-4" />
                Add source
              </Button>
            </div>

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

            {!loading && sources.length === 0 && !addingSource && (
              <EmptyState icon={Link2} title="No sources yet" hint="Add a government or institution page to crawl." />
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
                          {!source.active && <Badge className="bg-muted text-[10px] text-muted-foreground">Inactive</Badge>}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{source.url}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {source.doc_count} document{source.doc_count === 1 ? "" : "s"}
                          </span>
                          <span>
                            {CRAWL_FREQUENCY_OPTIONS.find((f) => f.value === source.crawl_frequency)?.label}
                          </span>
                          <span>
                            Last crawled: {source.last_crawled_at ? new Date(source.last_crawled_at).toLocaleString() : "Never"}
                          </span>
                        </div>
                        {source.last_error && (
                          <p className="mt-1 text-xs text-destructive">{source.last_error}</p>
                        )}
                        {source.crawl_summary && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Last run: {source.crawl_summary.added} added · {source.crawl_summary.updated} updated ·{" "}
                            {source.crawl_summary.unchanged} unchanged · {source.crawl_summary.failed} failed ·{" "}
                            {source.crawl_summary.embedded} embedded (via {source.crawl_summary.discovery_method})
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
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

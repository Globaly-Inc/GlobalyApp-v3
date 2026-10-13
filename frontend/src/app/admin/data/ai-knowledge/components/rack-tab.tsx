"use client";

import { useCallback, useEffect, useState } from "react";
import { Library, Link2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aiKnowledgeApi } from "../apis";
import type { RackCategory, RackDocument, RackSource } from "../apis/types";
import { CategoryForm } from "./category-form";
import { useConfirmDelete } from "./use-confirm-delete";
import { SourceForm } from "./source-form";
import { UploadSourceForm } from "./upload-source-form";
import { EmptyState, ListSkeleton } from "./shared";
import { DocumentDrawer } from "./document-drawer";
import { RackSourceCard } from "./rack-tab-source-card";

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
                <p className="truncate text-xs text-muted-foreground">
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
                <RackSourceCard
                  key={source.id}
                  source={source}
                  selected={selected}
                  documents={documents}
                  saving={saving}
                  confirm={confirm}
                  run={run}
                  expandedSourceId={expandedSourceId}
                  setExpandedSourceId={setExpandedSourceId}
                  setEditingSourceId={setEditingSourceId}
                  setAddingSource={setAddingSource}
                  setOpenDocumentId={setOpenDocumentId}
                  onReloadSources={onReloadSources}
                  onReloadDocuments={onReloadDocuments}
                />
              ),
            )}
          </>
        )}
      </div>

      <DocumentDrawer documentId={openDocumentId} onClose={() => setOpenDocumentId(null)} />
    </div>
  );
}

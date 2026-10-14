"use client";

import Link from "next/link";
import { Loader2, Save, SearchX, Tags } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import type { CategoryKind } from "../store/categories-slice";
import { CategoryBasicSection } from "./category-basic-section";
import { BusinessCoreFieldsSection, DefaultServicesSection, SchemaFieldsSection } from "./category-editor-sections";
import { API_KIND, useCategoryEditor } from "./use-category-editor";

const LIST_HREF = "/admin/platform/categories";

export function CategoryEditorView({
  kind,
  categoryId,
}: Readonly<{ kind: CategoryKind; categoryId: number | null }>) {
  const editor = useCategoryEditor(kind, categoryId);
  const { catalog, editing, label, saving, handleSave } = editor;
  const back = <BackButton href={LIST_HREF} label="Back to categories" />;

  if (editor.loadingRecord) {
    return (
      <PageBody>
        <CardSkeleton lines={6} />
      </PageBody>
    );
  }

  if (categoryId !== null && !editing) {
    return (
      <PageBody>
        <PageHeader leading={back} title="Category not found" />
        <EmptyState icon={SearchX} title="Category not found" description="It may have been deleted." />
      </PageBody>
    );
  }

  const saveButton = (
    <Button className="gap-2" onClick={handleSave} disabled={saving}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {editing ? "Save changes" : "Create category"}
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        leading={back}
        title={<><Tags /> {editing ? `Edit: ${editing.name}` : `New ${label}`}</>}
        badges={
          editing && (
            <Badge variant={editing.is_active ? "success" : "secondary"}>{editing.is_active ? "Active" : "Inactive"}</Badge>
          )
        }
        subtitle={editing ? `Slug: ${editing.slug}` : `Add a ${label} to the catalog.`}
      >
        {saveButton}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <CategoryBasicSection kind={kind} form={editor.form} setForm={editor.setForm} errors={editor.errors} editing={editing} />
          {kind === "business" && <BusinessCoreFieldsSection />}
          {kind === "business" && (
            <SchemaFieldsSection
              kind={kind}
              categoryId={categoryId}
              description="Define custom fields that businesses of this type will fill in on their profile."
            />
          )}
        </div>

        <div className="lg:col-span-1">
          {kind === "business" ? (
            <DefaultServicesSection
              loading={editor.loadingServices}
              serviceCategories={catalog.serviceCategoryOptions}
              selectedIds={editor.selectedServiceIds}
              onChange={editor.setSelectedServiceIds}
            />
          ) : (
            <SchemaFieldsSection
              kind={API_KIND[kind]}
              categoryId={categoryId}
              description="Define custom fields that businesses will fill in for services under this category."
              className="lg:sticky lg:top-6"
            />
          )}
        </div>
      </div>

      <StickySaveBar>
        <Button variant="outline" render={<Link href={LIST_HREF} />}>Cancel</Button>
        {saveButton}
      </StickySaveBar>
    </PageBody>
  );
}

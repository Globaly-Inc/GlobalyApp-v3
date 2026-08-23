"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useValidatedForm } from "@/lib/use-validated-form";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { categoriesApi } from "../apis";
import type { Category, SchemaField } from "../apis/types";
import { fetchBusinessCategories, fetchOtherServiceCategories, fetchServiceCategories } from "../store/categories-slice";
import type { CategoriesState, CategoryKind } from "../store/categories-slice";
import type { CategoryFormState } from "../types";
import { DefaultServicesPicker } from "./default-services-picker";
import { SchemaFieldsEditor } from "./schema-fields-editor";
import { BookingRequirementsPanel } from "./booking-requirements-panel";
import { CategoryDetailsCard } from "./category-details-card";
import { BusinessCategoryCards } from "./business-category-cards";

const schema: z.ZodType<CategoryFormState> = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
  description: z.string().max(1000, "Description must be 1000 characters or fewer"),
  icon: z.string(),
  sortOrder: z.string().regex(/^\d+$/, "Sort order must be a whole number"),
  isActive: z.boolean(),
});

const empty = (sortOrder: number): CategoryFormState => ({
  name: "", slug: "", description: "", icon: "", sortOrder: String(sortOrder), isActive: true,
});

const fromCategory = (c: Category): CategoryFormState => ({
  name: c.name,
  slug: c.slug,
  description: c.description ?? "",
  icon: c.icon ?? "",
  sortOrder: String(c.sort_order),
  isActive: c.is_active,
});

/**
 * The three things that differ per taxonomy. Two of them ("service" and "other_service") share every
 * endpoint and differ only by scope, so keeping them in tables beats threading conditionals through the
 * component.
 */
const LIST_FOR = {
  business: (c: CategoriesState) => c.businessCategories,
  service: (c: CategoriesState) => c.serviceCategories,
  other_service: (c: CategoriesState) => c.otherServiceCategories,
} as const;

const FETCH_FOR = {
  business: fetchBusinessCategories,
  service: fetchServiceCategories,
  other_service: fetchOtherServiceCategories,
} as const;

const LABEL: Record<CategoryKind, string> = {
  business: "business category",
  service: "service category",
  other_service: "other service category",
};

const API_KIND = { business: "business", service: "service", other_service: "other-service" } as const;

export function CategoryEditorView({
  kind,
  categoryId,
}: Readonly<{ kind: CategoryKind; categoryId: number | null }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const catalog = useAppSelector((state) => state.platformCategories);
  const listState = LIST_FOR[kind](catalog);
  const list = listState.data;
  const editing = categoryId !== null ? list.find((c) => c.id === categoryId) ?? null : null;
  const label = LABEL[kind];

  const [saving, setSaving] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  // Other Service Category booking requirements configured on the create page, before there is a category
  // id to attach them to. Stays empty when editing — the panel talks to the API directly then.
  const [pendingFields, setPendingFields] = useState<SchemaField[]>([]);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    // Categories are a small, curated taxonomy — fetch the max page size so this
    // editor can find the record being edited regardless of which page the list is on.
    dispatch(FETCH_FOR[kind]({ limit: 100 }));
    // The business editor also needs the business-scope service categories for its default-services picker
    // — never the personal ones, which are a different taxonomy.
    if (kind === "business") dispatch(fetchServiceCategories({ limit: 100 }));
  }, [dispatch, kind]);

  // `total`, not the loaded page's length: a new category should sort after every existing one, not after
  // the ten on page one. Already in the store when arriving from the list, which is the only way in.
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => empty(listState.total));

  const syncedRef = useRef(false);
  useEffect(() => {
    if (editing && !syncedRef.current) {
      syncedRef.current = true;
      reset(fromCategory(editing));
    }
  }, [editing, reset]);

  const fetchedServicesRef = useRef(false);
  useEffect(() => {
    if (kind !== "business" || categoryId === null || fetchedServicesRef.current) return;
    fetchedServicesRef.current = true;
    setLoadingServices(true);
    categoriesApi
      .getDefaultServices(categoryId)
      .then((services) => setSelectedServiceIds(services.map((s) => s.id)))
      .catch(() => toast.error("Couldn't load default service categories"))
      .finally(() => setLoadingServices(false));
  }, [kind, categoryId]);

  const loadingRecord = categoryId !== null && !editing && catalog.status === "loading";

  const handleSave = async () => {
    const data = validate();
    if (!data) return;
    setSaving(true);
    try {
      const input = {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        icon: data.icon || null,
        is_active: data.isActive,
        sort_order: Number(data.sortOrder),
      };
      const endpoint = API_KIND[kind];
      const row = categoryId
        ? await categoriesApi.updateCategory(endpoint, categoryId, input)
        : await categoriesApi.createCategory(endpoint, input);
      if (kind === "business") await categoriesApi.setDefaultServices(row.id, selectedServiceIds);

      // Booking requirements configured before the category existed. Created in order, one at a time,
      // because the server appends each new field to the end of the list.
      const unsaved = categoryId === null ? pendingFields : [];
      const rejected: string[] = [];
      for (const pending of unsaved) {
        // The temp id is local bookkeeping; the server assigns the real one.
        const { id, ...field } = pending;
        void id;
        try {
          await categoriesApi.createSchemaField("other-service", row.id, field);
        } catch {
          rejected.push(field.label);
        }
      }
      await dispatch(FETCH_FOR[kind]({ limit: 100 }));

      if (rejected.length > 0) {
        // The category is real, so say what did not make it and land on its editor rather than the list.
        toast.error("Category created, but some requirements didn't save", {
          description: `Add these again: ${rejected.join(", ")}`,
        });
        router.push(`/admin/platform/categories/other-service/${row.id}`);
        return;
      }

      toast.success(categoryId ? "Category updated" : "Category created");
      router.push("/admin/platform/categories");
    } catch (e) {
      toast.error("Something went wrong", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (loadingRecord) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (categoryId !== null && !editing) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Category not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/platform/categories")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{editing ? `Edit: ${editing.name}` : `New ${label}`}</h1>
        </div>
        <Button className="gap-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editing ? "Save changes" : "Create category"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CategoryDetailsCard kind={kind} form={form} errors={errors} setForm={setForm} slugFollowsName={!editing} />

          {kind === "business" && <BusinessCategoryCards categoryId={categoryId} />}
        </div>

        <div className="lg:col-span-1">
          {kind === "business" ? (
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Default Allowed Service Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Select which service categories are automatically allowed when a business of this type is approved.
                </p>
                {loadingServices ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <DefaultServicesPicker
                    serviceCategories={catalog.serviceCategories.data}
                    selectedIds={selectedServiceIds}
                    onChange={setSelectedServiceIds}
                  />
                )}
              </CardContent>
            </Card>
          ) : kind === "other_service" ? (
            // Other Service Categories configure a booking form, not profile fields — different concept,
            // different panel. The Super Admin Service Category card below is untouched.
            <BookingRequirementsPanel categoryId={categoryId} categoryName={form.name} onFieldsChange={setPendingFields} />
          ) : (
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Schema Fields</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Define custom fields that businesses will fill in for services under this category.
                </p>
              </CardHeader>
              <CardContent>
                <SchemaFieldsEditor kind={API_KIND[kind]} categoryId={categoryId} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

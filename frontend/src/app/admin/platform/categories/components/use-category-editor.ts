"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { useValidatedForm } from "@/lib/use-validated-form";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { categoriesApi } from "../apis";
import type { Category } from "../apis/types";
import { fetchBusinessCategories, fetchOtherServiceCategories, fetchServiceCategories, fetchServiceCategoryOptions } from "../store/categories-slice";
import type { CategoriesState, CategoryKind } from "../store/categories-slice";

type FormState = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
};

const schema: z.ZodType<FormState> = z.object({
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

const empty = (sortOrder: number): FormState => ({
  name: "", slug: "", description: "", icon: "", sortOrder: String(sortOrder), isActive: true,
});

const fromCategory = (c: Category): FormState => ({
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

export const API_KIND = { business: "business", service: "service", other_service: "other-service" } as const;

/** State, loading and save for the category editor; the view only lays it out. */
export function useCategoryEditor(kind: CategoryKind, categoryId: number | null) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const catalog = useAppSelector((state) => state.platformCategories);
  const list = LIST_FOR[kind](catalog).data;
  const editing = categoryId !== null ? list.find((c) => c.id === categoryId) ?? null : null;
  const label = LABEL[kind];

  const [saving, setSaving] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    // Categories are a small, curated taxonomy — fetch the max page size so this
    // editor can find the record being edited regardless of which page the list is on.
    dispatch(FETCH_FOR[kind]({ limit: 100 }));
    // The business editor also needs the business-scope service categories for its default-services picker
    // — never the personal ones, which are a different taxonomy. Uses the options slot so it
    // doesn't clobber the catalog page's paginated serviceCategories list.
    if (kind === "business") dispatch(fetchServiceCategoryOptions());
  }, [dispatch, kind]);

  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => empty(list.length));

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
      await dispatch(FETCH_FOR[kind]({ limit: 100 }));
      toast.success(categoryId ? "Category updated" : "Category created");
      router.push("/admin/platform/categories");
    } catch (e) {
      toast.error("Something went wrong", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return {
    catalog, editing, label, form, setForm, errors, saving, handleSave, loadingRecord,
    selectedServiceIds, setSelectedServiceIds, loadingServices,
  };
}

export type CategoryEditor = ReturnType<typeof useCategoryEditor>;

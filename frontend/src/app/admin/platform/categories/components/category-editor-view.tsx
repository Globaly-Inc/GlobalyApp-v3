"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { IconPicker } from "@/components/icon-picker";
import { useValidatedForm } from "@/lib/use-validated-form";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { categoriesApi } from "../apis";
import type { Category } from "../apis/types";
import { fetchBusinessCategories, fetchServiceCategories } from "../store/categories-slice";
import { toSlug } from "../utils";
import { RequiredMark } from "./required-mark";
import { DefaultServicesPicker } from "./default-services-picker";
import { SchemaFieldsEditor } from "./schema-fields-editor";

// Informational only — not fetched from the DB. Mirrors the columns on `businesses`
// so admins know what every business category gets for free before adding schema fields.
const BUSINESS_CORE_FIELDS: { name: string; type: string }[] = [
  { name: "Contact Name", type: "text" },
  { name: "Business Name", type: "text" },
  { name: "Business Type / Company Size", type: "select" },
  { name: "Description", type: "text" },
  { name: "Legal Name / Registration Number", type: "text" },
  { name: "Registration Licenses", type: "file" },
  { name: "Country / State / City / Address", type: "location" },
  { name: "Email", type: "email" },
  { name: "Phone", type: "phone" },
  { name: "Website", type: "url" },
  { name: "LinkedIn / Facebook / Instagram / Twitter / YouTube", type: "url" },
  { name: "Logo / Cover Image", type: "image" },
];

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

export function CategoryEditorView({
  kind,
  categoryId,
}: Readonly<{ kind: "business" | "service"; categoryId: number | null }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const catalog = useAppSelector((state) => state.platformCategories);
  const list = (kind === "business" ? catalog.businessCategories : catalog.serviceCategories).data;
  const editing = categoryId !== null ? list.find((c) => c.id === categoryId) ?? null : null;
  const label = kind === "business" ? "business category" : "service category";

  const [saving, setSaving] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    // Categories are a small, curated taxonomy — fetch the max page size so this
    // editor can find the record being edited regardless of which page the list is on.
    dispatch(kind === "business" ? fetchBusinessCategories({ limit: 100 }) : fetchServiceCategories({ limit: 100 }));
    if (kind === "business") dispatch(fetchServiceCategories({ limit: 100 }));
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
      const row = categoryId
        ? await categoriesApi.updateCategory(kind, categoryId, input)
        : await categoriesApi.createCategory(kind, input);
      if (kind === "business") await categoriesApi.setDefaultServices(row.id, selectedServiceIds);
      await dispatch(kind === "business" ? fetchBusinessCategories({ limit: 100 }) : fetchServiceCategories({ limit: 100 }));
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
          <Card>
            <CardHeader>
              <CardTitle>Basic Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="category-name">
                    Name
                    <RequiredMark />
                  </Label>
                  <Input
                    id="category-name"
                    className="h-9"
                    value={form.name}
                    placeholder="e.g. Accommodation"
                    aria-invalid={!!errors.name}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        name: e.target.value,
                        slug: editing ? f.slug : toSlug(e.target.value, "-"),
                      }))
                    }
                  />
                  <FieldError message={errors.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category-slug">
                    Slug
                    <RequiredMark />
                  </Label>
                  <Input
                    id="category-slug"
                    className="h-9"
                    value={form.slug}
                    aria-invalid={!!errors.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  />
                  <FieldError message={errors.slug} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-description">Description</Label>
                <Textarea
                  id="category-description"
                  rows={4}
                  className="min-h-24"
                  value={form.description}
                  aria-invalid={!!errors.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                <FieldError message={errors.description} />
              </div>

              {kind === "business" ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category-icon">Icon</Label>
                    <IconPicker id="category-icon" value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <Label htmlFor="category-active">Active</Label>
                    <Switch
                      id="category-active"
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="category-icon">Icon</Label>
                      <IconPicker id="category-icon" value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category-sort">Sort order</Label>
                      <Input
                        id="category-sort"
                        className="h-9"
                        inputMode="numeric"
                        value={form.sortOrder}
                        aria-invalid={!!errors.sortOrder}
                        onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                      />
                      <FieldError message={errors.sortOrder} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="category-active">Active</Label>
                    <Switch
                      id="category-active"
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {kind === "business" && (
            <Card>
              <CardHeader>
                <CardTitle>Business Core Fields (Built-in)</CardTitle>
                <p className="text-sm text-muted-foreground">
                  These fields are already part of every business profile and cannot be modified here.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {BUSINESS_CORE_FIELDS.map((field) => (
                    <div key={field.name} className="flex items-center gap-2 py-1">
                      <Badge variant="outline" className="shrink-0 font-mono text-xs">
                        {field.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{field.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {kind === "business" && (
            <Card>
              <CardHeader>
                <CardTitle>Schema Fields</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Define custom fields that businesses of this type will fill in on their profile.
                </p>
              </CardHeader>
              <CardContent>
                <SchemaFieldsEditor kind={kind} categoryId={categoryId} />
              </CardContent>
            </Card>
          )}
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
          ) : (
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Schema Fields</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Define custom fields that businesses will fill in for services under this category.
                </p>
              </CardHeader>
              <CardContent>
                <SchemaFieldsEditor kind={kind} categoryId={categoryId} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { IconPicker } from "@/components/icon-picker";
import { useValidatedForm } from "@/lib/use-validated-form";
import { RequiredMark } from "./required-mark";
import { toSlug } from "../utils";
import type { Category, CategoryInput } from "../apis/types";

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

export function CategoryDialog({
  open,
  onOpenChange,
  kind,
  editing,
  nextSortOrder,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "business" | "service" | "other_service";
  editing: Category | null;
  nextSortOrder: number;
  onSave: (input: CategoryInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const initial = () => (editing ? fromCategory(editing) : empty(nextSortOrder));
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, initial);

  // `open` flips from the parent (row click), not from Dialog's own onOpenChange,
  // so the form has to re-sync here rather than in the close-only handler below.
  useEffect(() => {
    if (open) reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const ok = await onSave({
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      icon: data.icon || null,
      is_active: data.isActive,
      sort_order: Number(data.sortOrder),
    });
    if (ok) onOpenChange(false);
  };

  const label =
    kind === "business" ? "business category" : kind === "other_service" ? "other service category" : "service category";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight">{editing ? `Edit ${label}` : `New ${label}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                  // Slug tracks the name until the record exists, then stays put
                  // so published URLs don't change under an edit.
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

          <div className="grid grid-cols-2 gap-4">
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
        </div>

        <DialogFooter>
          <Button className="h-10 w-full" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

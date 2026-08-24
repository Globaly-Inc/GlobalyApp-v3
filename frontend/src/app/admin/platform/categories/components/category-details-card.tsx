"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { IconPicker } from "@/components/icon-picker";
import type { CategoryKind } from "../store/categories-slice";
import type { CategoryFormState } from "../types";
import { toSlug } from "../utils";
import { RequiredMark } from "./required-mark";

/**
 * Name, slug, description, icon and active state — the same for all three taxonomies, except that a
 * business category has no sort order.
 */
export function CategoryDetailsCard({
  kind,
  form,
  errors,
  setForm,
  slugFollowsName,
}: Readonly<{
  kind: CategoryKind;
  form: CategoryFormState;
  errors: Partial<Record<keyof CategoryFormState, string>>;
  /** The updater shape useValidatedForm hands back — always functional, never a bare value. */
  setForm: (updater: (form: CategoryFormState) => CategoryFormState) => void;
  /** False once the record exists: renaming an existing category must not silently move its slug. */
  slugFollowsName: boolean;
}>) {
  return (
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
                  slug: slugFollowsName ? toSlug(e.target.value, "-") : f.slug,
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category-icon">Icon</Label>
            <IconPicker id="category-icon" value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
          </div>
          {kind !== "business" && (
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
          )}
        </div>

        <div className={kind === "business" ? "flex items-center gap-3" : "flex items-center justify-between"}>
          <Label htmlFor="category-active">Active</Label>
          <Switch
            id="category-active"
            checked={form.isActive}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}

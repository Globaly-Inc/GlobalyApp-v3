"use client";

import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconPicker } from "@/components/icon-picker";
import type { CategoryKind } from "../store/categories-slice";
import { toSlug } from "../utils";
import type { CategoryEditor } from "./use-category-editor";

type Props = Readonly<Pick<CategoryEditor, "form" | "setForm" | "errors" | "editing"> & { kind: CategoryKind }>;

/** Name, slug, description, icon, sort order (non-business only) and the active switch. */
export function CategoryBasicSection({ kind, form, setForm, errors, editing }: Props) {
  const activeSwitch = (
    <Switch
      id="category-active"
      checked={form.isActive}
      onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
    />
  );

  return (
    <FormSection title="Basic Details">
      <FormField label="Name" htmlFor="category-name" required error={errors.name}>
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
      </FormField>
      <FormField label="Slug" htmlFor="category-slug" required error={errors.slug}>
        <Input
          id="category-slug"
          className="h-9"
          value={form.slug}
          aria-invalid={!!errors.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        />
      </FormField>

      <FormField label="Description" htmlFor="category-description" error={errors.description} wide>
        <Textarea
          id="category-description"
          rows={4}
          className="min-h-24"
          value={form.description}
          aria-invalid={!!errors.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </FormField>

      <FormField label="Icon" htmlFor="category-icon">
        <IconPicker id="category-icon" value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
      </FormField>
      {kind === "business" ? (
        <div className="flex items-center gap-3 sm:pt-6">
          <Label htmlFor="category-active">Active</Label>
          {activeSwitch}
        </div>
      ) : (
        <>
          <FormField label="Sort order" htmlFor="category-sort" error={errors.sortOrder}>
            <Input
              id="category-sort"
              className="h-9"
              inputMode="numeric"
              value={form.sortOrder}
              aria-invalid={!!errors.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </FormField>
          <div className="flex items-center justify-between sm:col-span-full">
            <Label htmlFor="category-active">Active</Label>
            {activeSwitch}
          </div>
        </>
      )}
    </FormSection>
  );
}

"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageDropzone } from "@/components/image-dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { RequiredMark } from "./required-mark";
import { toSlug } from "../utils";
import { TEST_CATEGORY_OPTIONS } from "../const";
import { categoriesApi } from "../apis";
import type { Test, TestCategory, TestInput } from "../apis/types";

type FormState = {
  name: string;
  slug: string;
  category: TestCategory | "";
  imageUrl: string | null;
  sortOrder: string;
  isActive: boolean;
};

const schema: z.ZodType<FormState> = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Use lowercase words separated by underscores"),
  category: z.enum(["academic", "language"], { message: "Pick a test type" }),
  imageUrl: z.string().nullable(),
  sortOrder: z.string().regex(/^\d+$/, "Sort order must be a whole number"),
  isActive: z.boolean(),
});

export function TestDialog({
  open,
  onOpenChange,
  editing,
  nextSortOrder,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Test | null;
  nextSortOrder: number;
  onSave: (input: TestInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const initial = (): FormState =>
    editing
      ? {
        name: editing.name,
        slug: editing.slug,
        category: editing.category,
        imageUrl: editing.image_url,
        sortOrder: String(editing.sort_order),
        isActive: editing.is_active,
      }
      : { name: "", slug: "", category: "", imageUrl: null, sortOrder: String(nextSortOrder), isActive: true };

  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, initial);

  // `open` flips from the parent (row click), not from Dialog's own onOpenChange,
  // so the form has to re-sync here rather than in the close-only handler below.
  useEffect(() => {
    if (open) reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const handleSubmit = async () => {
    const data = validate();
    if (!data || !data.category) return;
    const ok = await onSave({
      name: data.name,
      slug: data.slug,
      category: data.category,
      image_url: data.imageUrl,
      sort_order: Number(data.sortOrder),
      is_active: data.isActive,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit test" : "New test"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="test-name">
              Name
              <RequiredMark />
            </Label>
            <Input
              id="test-name"
              value={form.name}
              placeholder="e.g. IELTS"
              aria-invalid={!!errors.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value, slug: editing ? f.slug : toSlug(e.target.value) }))
              }
            />
            <FieldError message={errors.name} />
          </div>

          {/* flex-col gap, never space-y — the Combobox's focus guards inflate space-y containers. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="test-category">
              Type of test
              <RequiredMark />
            </Label>
            <Combobox
              id="test-category"
              options={TEST_CATEGORY_OPTIONS}
              value={form.category}
              onChange={(value) => setForm((f) => ({ ...f, category: value as TestCategory }))}
              placeholder="Academic or language"
              aria-invalid={!!errors.category}
            />
            <FieldError message={errors.category} />
          </div>

          <div className="space-y-2">
            <Label>Image</Label>
            <ImageDropzone
              value={form.imageUrl}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              onUpload={async (file) => ({ url: (await categoriesApi.uploadTestImage(file)).image_url })}
            />
            <p className="text-xs text-muted-foreground">
              Shown next to this test on course eligibility cards and profile test scores.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-slug">
              Slug
              <RequiredMark />
            </Label>
            <Input
              id="test-slug"
              value={form.slug}
              aria-invalid={!!errors.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
            <FieldError message={errors.slug} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-sort">Sort order</Label>
            <Input
              id="test-sort"
              inputMode="numeric"
              value={form.sortOrder}
              aria-invalid={!!errors.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
            <FieldError message={errors.sortOrder} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="test-active">Active</Label>
            <Switch
              id="test-active"
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full h-10" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

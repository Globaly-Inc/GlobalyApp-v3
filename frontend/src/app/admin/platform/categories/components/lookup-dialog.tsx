"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { RequiredMark } from "./required-mark";
import { toSlug } from "../utils";
import type { Lookup, LookupInput } from "../apis/types";

type FormState = { name: string; slug: string; sortOrder: string; isActive: boolean };

const schema: z.ZodType<FormState> = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Use lowercase words separated by underscores"),
  sortOrder: z.string().regex(/^\d+$/, "Sort order must be a whole number"),
  isActive: z.boolean(),
});

export function LookupDialog({
  open,
  onOpenChange,
  title,
  editing,
  nextSortOrder,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  editing: Lookup | null;
  nextSortOrder: number;
  onSave: (input: LookupInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const initial = (): FormState =>
    editing
      ? { name: editing.name, slug: editing.slug, sortOrder: String(editing.sort_order), isActive: editing.is_active }
      : { name: "", slug: "", sortOrder: String(nextSortOrder), isActive: true };

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
      sort_order: Number(data.sortOrder),
      is_active: data.isActive,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${title}` : `New ${title}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lookup-name">
              Name
              <RequiredMark />
            </Label>
            <Input
              id="lookup-name"
              value={form.name}
              placeholder={`e.g. ${title}`}
              aria-invalid={!!errors.name}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  name: e.target.value,
                  slug: editing ? f.slug : toSlug(e.target.value),
                }))
              }
            />
            <FieldError message={errors.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lookup-slug">
              Slug
              <RequiredMark />
            </Label>
            <Input
              id="lookup-slug"
              value={form.slug}
              aria-invalid={!!errors.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
            <FieldError message={errors.slug} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lookup-sort">Sort order</Label>
            <Input
              id="lookup-sort"
              inputMode="numeric"
              value={form.sortOrder}
              aria-invalid={!!errors.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
            <FieldError message={errors.sortOrder} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="lookup-active">Active</Label>
            <Switch
              id="lookup-active"
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full h-10" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : `Create ${title}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

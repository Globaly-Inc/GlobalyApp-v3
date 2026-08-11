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
import type { FeeType, FeeTypeInput } from "../apis/types";

type FormState = { name: string; slug: string; sortOrder: string; isGlobal: boolean };

const schema: z.ZodType<FormState> = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Use lowercase words separated by underscores"),
  sortOrder: z.string().regex(/^\d+$/, "Sort order must be a whole number"),
  isGlobal: z.boolean(),
});

export function FeeTypeDialog({
  open,
  onOpenChange,
  editing,
  nextSortOrder,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: FeeType | null;
  nextSortOrder: number;
  onSave: (input: FeeTypeInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const initial = (): FormState =>
    editing
      ? { name: editing.name, slug: editing.slug, sortOrder: String(editing.sort_order), isGlobal: editing.is_global }
      : { name: "", slug: "", sortOrder: String(nextSortOrder), isGlobal: true };

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
      is_global: data.isGlobal,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit fee type" : "New fee type"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fee-name">
              Name
              <RequiredMark />
            </Label>
            <Input
              id="fee-name"
              value={form.name}
              placeholder="e.g. Tuition Fee"
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
            <Label htmlFor="fee-slug">
              Slug
              <RequiredMark />
            </Label>
            <Input
              id="fee-slug"
              value={form.slug}
              aria-invalid={!!errors.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
            <FieldError message={errors.slug} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fee-sort">Sort order</Label>
            <Input
              id="fee-sort"
              inputMode="numeric"
              value={form.sortOrder}
              aria-invalid={!!errors.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
            <FieldError message={errors.sortOrder} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="fee-global">Global (available to all businesses)</Label>
            <Switch
              id="fee-global"
              checked={form.isGlobal}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, isGlobal: checked }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create fee type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

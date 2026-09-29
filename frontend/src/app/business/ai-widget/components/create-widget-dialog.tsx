"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CreateEmbedConfigInput,
  EmbedConfig,
  UpdateEmbedConfigInput,
} from "../apis/types";

const EMPTY = {
  display_name: "",
  logo_url: "",
  brand_color: "#4f46e5",
  greeting: "",
  subtitle: "",
  custom_instructions: "",
  monthly_credit_limit: "1000",
};
type Form = typeof EMPTY;

const fromConfig = (c: EmbedConfig): Form => ({
  display_name: c.display_name ?? "",
  logo_url: c.logo_url ?? "",
  brand_color: c.brand_color ?? EMPTY.brand_color,
  greeting: c.greeting ?? "",
  subtitle: c.subtitle ?? "",
  custom_instructions: c.custom_instructions ?? "",
  monthly_credit_limit: String(c.monthly_credit_limit),
});

/** Create a widget, or — with `initial` — edit one's appearance. Same fields either way. */
export function CreateWidgetDialog({
  open,
  onOpenChange,
  onCreate,
  onUpdate,
  initial,
  creating,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate?: (input: CreateEmbedConfigInput) => Promise<boolean>;
  onUpdate?: (id: number, input: UpdateEmbedConfigInput) => Promise<boolean>;
  /** The widget being edited; absent when creating. */
  initial?: EmbedConfig;
  creating: boolean;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Widget appearance" : "New AI widget"}
          </DialogTitle>
        </DialogHeader>
        {/* Keyed so each open (and each widget) seeds a fresh form: a cancelled edit never
            leaks into the next one, and no effect has to copy props into state. */}
        <WidgetForm
          key={initial?.id ?? "new"}
          initial={initial}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onClose={() => onOpenChange(false)}
          creating={creating}
        />
      </DialogContent>
    </Dialog>
  );
}

function WidgetForm({
  initial,
  onCreate,
  onUpdate,
  onClose,
  creating,
}: Readonly<{
  initial?: EmbedConfig;
  onCreate?: (input: CreateEmbedConfigInput) => Promise<boolean>;
  onUpdate?: (id: number, input: UpdateEmbedConfigInput) => Promise<boolean>;
  onClose: () => void;
  creating: boolean;
}>) {
  const [form, setForm] = useState<Form>(() =>
    initial ? fromConfig(initial) : EMPTY,
  );
  const set =
    (key: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  // `creating` only tracks the create thunk; an edit needs its own guard against a double Save.
  const [saving, setSaving] = useState(false);
  const busy = creating || saving;

  const submit = async () => {
    const text = (v: string) => v.trim() || undefined;
    const limit = Number(form.monthly_credit_limit) || undefined;
    setSaving(true);
    let ok: boolean | undefined;
    // finally: a rejected save must not leave the buttons stuck on "Saving…".
    try {
      ok = initial
        ? await onUpdate?.(initial.id, {
            // Edit: an emptied field is cleared, not left as it was.
            display_name: text(form.display_name) ?? null,
            logo_url: text(form.logo_url) ?? null,
            brand_color: form.brand_color || null,
            greeting: text(form.greeting) ?? null,
            subtitle: text(form.subtitle) ?? null,
            custom_instructions: text(form.custom_instructions) ?? null,
            monthly_credit_limit: limit,
          })
        : await onCreate?.({
            display_name: text(form.display_name),
            logo_url: text(form.logo_url),
            brand_color: form.brand_color || undefined,
            greeting: text(form.greeting),
            subtitle: text(form.subtitle),
            custom_instructions: text(form.custom_instructions),
            monthly_credit_limit: limit,
          });
    } finally {
      setSaving(false);
    }
    if (ok) onClose();
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-name">Display name</Label>
          <Input
            id="widget-name"
            value={form.display_name}
            onChange={set("display_name")}
            placeholder="Acme University Counsellor"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-subtitle">Subtitle (optional)</Label>
          <Input
            id="widget-subtitle"
            value={form.subtitle}
            onChange={set("subtitle")}
            maxLength={120}
            placeholder="Usually replies in seconds"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-greeting">Greeting (optional)</Label>
          <Textarea
            id="widget-greeting"
            value={form.greeting}
            onChange={set("greeting")}
            maxLength={300}
            rows={2}
            placeholder="Hi! Ask me anything about studying with us."
          />
        </div>

        {/* ponytail: logo is a URL field — file upload rides Phase 4's attachment endpoint */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-logo">Logo URL (optional)</Label>
          <Input
            id="widget-logo"
            value={form.logo_url}
            onChange={set("logo_url")}
            placeholder="https://…/logo.png"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-color">Brand colour</Label>
          <Input
            id="widget-color"
            type="color"
            value={form.brand_color}
            onChange={set("brand_color")}
            className="h-10 w-20 p-1"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-instructions">
            Custom instructions (optional)
          </Label>
          <Textarea
            id="widget-instructions"
            value={form.custom_instructions}
            onChange={set("custom_instructions")}
            placeholder="e.g. Always mention our February and July intakes."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Instructions that attempt to override the counsellor&apos;s
            behaviour are ignored.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-limit">Monthly message limit</Label>
          <Input
            id="widget-limit"
            type="number"
            min={1}
            value={form.monthly_credit_limit}
            onChange={set("monthly_credit_limit")}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : initial ? "Save" : "Create widget"}
        </Button>
      </DialogFooter>
    </>
  );
}

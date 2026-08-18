"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CreateEmbedConfigInput } from "../apis/types";

const EMPTY = {
  display_name: "",
  logo_url: "",
  brand_color: "#4f46e5",
  custom_instructions: "",
  monthly_credit_limit: "1000",
};

export function CreateWidgetDialog({
  open,
  onOpenChange,
  onCreate,
  creating,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateEmbedConfigInput) => Promise<boolean>;
  creating: boolean;
}>) {
  const [form, setForm] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    const ok = await onCreate({
      display_name: form.display_name.trim() || undefined,
      logo_url: form.logo_url.trim() || undefined,
      brand_color: form.brand_color || undefined,
      custom_instructions: form.custom_instructions.trim() || undefined,
      monthly_credit_limit: Number(form.monthly_credit_limit) || undefined,
    });
    if (ok) {
      setForm(EMPTY);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New AI widget</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-name">Display name</Label>
            <Input id="widget-name" value={form.display_name} onChange={set("display_name")} placeholder="Acme University Counsellor" />
          </div>

          {/* ponytail: logo is a URL field — file upload rides Phase 4's attachment endpoint */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-logo">Logo URL (optional)</Label>
            <Input id="widget-logo" value={form.logo_url} onChange={set("logo_url")} placeholder="https://…/logo.png" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-color">Brand colour</Label>
            <Input id="widget-color" type="color" value={form.brand_color} onChange={set("brand_color")} className="h-10 w-20 p-1" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-instructions">Custom instructions (optional)</Label>
            <Textarea
              id="widget-instructions"
              value={form.custom_instructions}
              onChange={set("custom_instructions")}
              placeholder="e.g. Always mention our February and July intakes."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Instructions that attempt to override the counsellor&apos;s behaviour are ignored.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-limit">Monthly message limit</Label>
            <Input id="widget-limit" type="number" min={1} value={form.monthly_credit_limit} onChange={set("monthly_credit_limit")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={creating}>
            {creating ? "Creating…" : "Create widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

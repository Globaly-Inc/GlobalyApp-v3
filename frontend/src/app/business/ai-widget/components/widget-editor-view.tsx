"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { createEmbedConfig, updateEmbedConfig } from "../store/ai-widget-slice";
import type { EmbedConfig } from "../apis/types";
import {
  EMPTY_WIDGET_FORM, formFromConfig, toCreateInput, toUpdateInput, WidgetFormFields, type WidgetFormValues,
} from "./widget-form";
import { WidgetPreview } from "./widget-preview";

/**
 * Create the widget (no `initial`) or edit it: the settings on the left, the live preview on the
 * right, both reading the same form values so the preview follows every keystroke. The caller
 * keys it by widget, so the form seeds once from the saved config.
 */
export function WidgetEditor({ initial }: Readonly<{ initial?: EmbedConfig }>) {
  const dispatch = useAppDispatch();
  const { user } = useAuthState();
  const [form, setForm] = useState<WidgetFormValues>(() => (initial ? formFromConfig(initial) : EMPTY_WIDGET_FORM));
  const [saving, setSaving] = useState(false);
  const ownerKind = user?.institutions.some((i) => i.org_id === user.orgId) ? "institution" : "business";

  const save = async () => {
    setSaving(true);
    // finally: a rejected save must not leave the button stuck on "Saving…".
    try {
      const result = initial
        ? await dispatch(updateEmbedConfig({ id: initial.id, input: toUpdateInput(form) }))
        : await dispatch(createEmbedConfig(toCreateInput(form)));
      if ("error" in result) toast.error(initial ? "Couldn't save the widget" : "Couldn't create the widget", { description: result.error.message ?? "Please try again." });
      else toast.success(initial ? "Widget saved" : "Widget created");
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial ? formFromConfig(initial) : EMPTY_WIDGET_FORM);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{initial ? "Appearance & settings" : "Create your widget"}</h2>
        <p className="text-sm text-muted-foreground">Changes show in the preview as you type. Nothing is live until you save.</p>
      </div>

      {/* Settings left, live preview right (sticky, so it stays in view while the form scrolls). */}
      <div className="grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-5">
          <WidgetFormFields form={form} setForm={setForm} />
          <div className="mt-5 flex justify-end gap-2 border-t pt-4">
            {initial && (
              <Button variant="outline" onClick={() => setForm(formFromConfig(initial))} disabled={saving || !dirty}>Cancel</Button>
            )}
            <Button onClick={save} disabled={saving || (!!initial && !dirty)}>{saving ? "Saving…" : initial ? "Save" : "Create widget"}</Button>
          </div>
        </div>
        <div className="lg:sticky lg:top-20">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Live preview</p>
          <WidgetPreview form={form} ownerKind={ownerKind} />
        </div>
      </div>
    </div>
  );
}

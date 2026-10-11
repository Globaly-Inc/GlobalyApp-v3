"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { useAppDispatch } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { createEmbedConfig, updateEmbedConfig } from "../store/ai-widget-slice";
import type { EmbedConfig } from "../apis/types";
import {
  EMPTY_WIDGET_FORM, formFromConfig, toCreateInput, toUpdateInput, WidgetFormFields, type WidgetFormValues,
} from "./widget-form";
import { WidgetPreview } from "./widget-preview";

/**
 * Create the widget (no `initial`) or edit it: the settings cards on the left, the live preview on
 * the right, both reading the same form values so the preview follows every keystroke. The
 * caller keys it by widget, so the form seeds once from the saved config.
 *
 * The Create/Save buttons ride in a StickySaveBar under the settings, and from `lg` the preview
 * sticks beside them while the settings scroll — neither is ever out of reach.
 */
export function WidgetEditor({
  initial,
  card,
}: Readonly<{
  initial?: EmbedConfig;
  /** The widget's embed code and key controls, above the settings. Edit mode only. */
  card?: React.ReactNode;
}>) {
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
  // The backend rejects anything but #RRGGBB; a half-typed hex must not reach it.
  const validColor = /^#[0-9a-f]{6}$/i.test(form.brand_color);

  const status = !validColor ? (
    <span className="text-destructive">Brand colour must be a hex like #4F46E5</span>
  ) : dirty || !initial ? (
    <span className="flex items-center gap-1.5"><CircleDot className="size-4 text-warning" aria-hidden /> {initial ? "Unsaved changes" : "Not created yet"}</span>
  ) : (
    <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" aria-hidden /> All changes saved</span>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4 md:gap-6">
        {card}
        <WidgetFormFields
          form={form}
          setForm={setForm}
          appearanceFooter={
            !initial && (
              <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Code2 className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">Your embed code comes next</p>
                  <p className="text-xs text-muted-foreground">
                    Create the widget to get the one-line tag to paste before <code>&lt;/body&gt;</code> on your website.
                  </p>
                </div>
              </div>
            )
          }
        />
        <StickySaveBar status={status}>
          {initial && (
            <Button variant="outline" onClick={() => setForm(formFromConfig(initial))} disabled={saving || !dirty}>Discard</Button>
          )}
          <Button onClick={save} disabled={saving || !validColor || (!!initial && !dirty)}>
            {saving ? "Saving…" : initial ? "Save changes" : "Create widget"}
          </Button>
        </StickySaveBar>
      </div>
      {/* The live preview, pinned beside the settings from lg while they scroll. */}
      <div className="flex min-w-0 lg:sticky lg:top-20">
        <WidgetPreview form={form} ownerKind={ownerKind} />
      </div>
    </div>
  );
}

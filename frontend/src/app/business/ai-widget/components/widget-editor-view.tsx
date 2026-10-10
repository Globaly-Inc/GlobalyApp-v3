"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { createEmbedConfig, updateEmbedConfig } from "../store/ai-widget-slice";
import type { EmbedConfig } from "../apis/types";
import {
  EMPTY_WIDGET_FORM, formFromConfig, toCreateInput, toUpdateInput, WidgetFormFields, type WidgetFormValues,
} from "./widget-form";
import { WidgetPreview } from "./widget-preview";

/**
 * Create the widget (no `initial`) or edit it: the settings on the left half, the live preview on
 * the right half, both reading the same form values so the preview follows every keystroke. The
 * caller keys it by widget, so the form seeds once from the saved config.
 *
 * From xl the whole thing fits one screen: the Create/Save buttons share the page heading's row,
 * and the settings scroll inside their own cards if a short window can't hold them — the page
 * itself never does, so the buttons are never below the fold.
 */
export function WidgetEditor({
  initial,
  heading,
  card,
}: Readonly<{
  initial?: EmbedConfig;
  /** The page title, drawn here so the save buttons can sit beside it. */
  heading: React.ReactNode;
  /** The widget's embed code and key controls, across the top of the settings. Edit mode only. */
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        <div className="flex items-center gap-3">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {!validColor ? (
              <span className="text-destructive">Brand colour must be a hex like #4F46E5</span>
            ) : dirty || !initial ? (
              <><CircleDot className="size-4 text-amber-500" aria-hidden /> {initial ? "Unsaved changes" : "Not created yet"}</>
            ) : (
              <><CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> All changes saved</>
            )}
          </p>
          {initial && (
            <Button variant="ghost" onClick={() => setForm(formFromConfig(initial))} disabled={saving || !dirty}>Discard</Button>
          )}
          <Button className="h-10 px-4" onClick={save} disabled={saving || !validColor || (!!initial && !dirty)}>
            {saving ? "Saving…" : initial ? "Save changes" : "Create widget"}
          </Button>
        </div>
      </div>

      {/* xl: settings take two equal columns of the left half, the preview the right half and the
          full height. Below xl it all stacks and the page scrolls as usual. */}
      <div
        className={cn(
          "grid gap-4 md:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] xl:gap-x-5",
          card && "xl:grid-rows-[auto_minmax(0,1fr)]",
        )}
      >
        {card && <div className="md:col-span-2">{card}</div>}
        <WidgetFormFields
          form={form}
          setForm={setForm}
          appearanceFooter={
            !initial && (
              <div className="mx-5 mb-5 mt-auto flex items-start gap-3 rounded-xl border border-dashed p-4">
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
        <div className={cn("flex md:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:min-h-0", card && "xl:row-span-2")}>
          <WidgetPreview form={form} ownerKind={ownerKind} />
        </div>
      </div>
    </div>
  );
}

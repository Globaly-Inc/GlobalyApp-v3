"use client";

import { Check, MessageSquareText, Palette, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { radioGroupKeyDown, radioTabIndex } from "../utils";
import type {
  CreateEmbedConfigInput,
  EmbedConfig,
  UpdateEmbedConfigInput,
  WidgetPosition,
} from "../apis/types";

export const EMPTY_WIDGET_FORM = {
  display_name: "",
  brand_color: "#4f46e5",
  position: "right" as WidgetPosition,
  greeting: "",
  subtitle: "",
  custom_instructions: "",
};
export type WidgetFormValues = typeof EMPTY_WIDGET_FORM;

export const formFromConfig = (c: EmbedConfig): WidgetFormValues => ({
  display_name: c.display_name ?? "",
  brand_color: c.brand_color ?? EMPTY_WIDGET_FORM.brand_color,
  position: c.position ?? "right",
  greeting: c.greeting ?? "",
  subtitle: c.subtitle ?? "",
  custom_instructions: c.custom_instructions ?? "",
});

const text = (v: string) => v.trim() || undefined;

export const toCreateInput = (form: WidgetFormValues): CreateEmbedConfigInput => ({
  display_name: text(form.display_name),
  brand_color: form.brand_color || undefined,
  position: form.position,
  greeting: text(form.greeting),
  subtitle: text(form.subtitle),
  custom_instructions: text(form.custom_instructions),
});

/** Edit: an emptied field is cleared, not left as it was. */
export const toUpdateInput = (form: WidgetFormValues): UpdateEmbedConfigInput => ({
  display_name: text(form.display_name) ?? null,
  brand_color: form.brand_color || null,
  position: form.position,
  greeting: text(form.greeting) ?? null,
  subtitle: text(form.subtitle) ?? null,
  custom_instructions: text(form.custom_instructions) ?? null,
});

/** One-click brand colours; any other hex can still be typed or picked. */
const SWATCHES = ["#012E8A", "#4F46E5", "#0891B2", "#0D9488", "#16A34A", "#D97706", "#DC2626", "#DB2777", "#111827"];

/** Character count for a capped field, shown as the field's hint. */
const counter = (count: number, max: number) => <span className="tabular-nums">{count}/{max}</span>;

/**
 * The widget's settings, controlled — the editor page owns the values so its preview can follow
 * them. Three settings cards — Identity, Conversation, Appearance — stacked in the editor's
 * settings column.
 */
export function WidgetFormFields({
  form,
  setForm,
  appearanceFooter,
}: Readonly<{
  form: WidgetFormValues;
  setForm: React.Dispatch<React.SetStateAction<WidgetFormValues>>;
  /** Shown under Appearance — the editor's create-mode "embed code comes next" note. */
  appearanceFooter?: React.ReactNode;
}>) {
  const set =
    (key: keyof WidgetFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  const setColor = (hex: string) => setForm((f) => ({ ...f, brand_color: hex }));
  const isHex = /^#[0-9a-f]{6}$/i.test(form.brand_color);
  const swatchChecked = SWATCHES.some((hex) => hex.toLowerCase() === form.brand_color.toLowerCase());

  const identity = (
    <FormSection title={<><UserRound aria-hidden /> Identity</>} description="How the counsellor introduces itself in the header.">
      <FormField label="Display name" htmlFor="widget-name">
        <Input id="widget-name" value={form.display_name} onChange={set("display_name")} placeholder="Acme University Counsellor" />
      </FormField>
      <FormField label="Subtitle" htmlFor="widget-subtitle" optional hint={counter(form.subtitle.length, 120)}>
        <Input id="widget-subtitle" value={form.subtitle} onChange={set("subtitle")} maxLength={120} placeholder="Usually replies in seconds" />
      </FormField>
    </FormSection>
  );

  const appearance = (
    <FormSection
      title={<><Palette aria-hidden /> Appearance</>}
      description="Aly, the launcher and every button take on your colour."
      columns={1}
    >
      <FormField label="Brand colour" htmlFor="widget-color-hex">
        {/* No logo upload: every widget shows Aly, in this colour. */}
        <div className="flex items-center gap-2">
          <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border" style={{ backgroundColor: isHex ? form.brand_color : undefined }}>
            <input type="color" aria-label="Pick a colour" value={isHex ? form.brand_color : "#4f46e5"} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <Input id="widget-color-hex" value={form.brand_color} onChange={set("brand_color")} maxLength={7} className="w-36 font-mono uppercase" aria-invalid={!isHex} />
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Preset colours" onKeyDown={radioGroupKeyDown}>
          {SWATCHES.map((hex, i) => {
            const on = form.brand_color.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={radioTabIndex(on, i, swatchChecked)}
                aria-label={hex}
                onClick={() => setColor(hex)}
                // ponytail: white check on the swatch's own hex, the swatches are data not theme colours.
                className={cn("flex size-8 items-center justify-center rounded-full text-white transition-transform hover:scale-110", on && "ring-2 ring-offset-2 ring-offset-card")}
                style={{ backgroundColor: hex, ...(on ? { ["--tw-ring-color" as string]: hex } : {}) }}
              >
                {on && <Check className="size-4" aria-hidden />}
              </button>
            );
          })}
        </div>
      </FormField>
      <FormField label={<span id="widget-position">Position on your website</span>}>
        <div role="radiogroup" aria-labelledby="widget-position" className="grid grid-cols-2 gap-3" onKeyDown={radioGroupKeyDown}>
          {(["left", "right"] as const).map((side) => {
            const on = form.position === side;
            return (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setForm((f) => ({ ...f, position: side }))}
                className={cn("flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors", on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}
              >
                {/* A tiny page with the orb in that corner. */}
                <span className="relative flex h-14 flex-col gap-1.5 rounded-md border bg-background p-2" aria-hidden>
                  <span className="h-1 w-8 rounded bg-muted-foreground/25" />
                  <span className="h-1 w-14 rounded bg-muted-foreground/15" />
                  <span className={cn("absolute bottom-1.5 size-3 rounded-full", side === "left" ? "left-1.5" : "right-1.5", on ? "bg-primary" : "bg-muted-foreground/30")} />
                </span>
                <span className="flex items-center justify-between text-sm font-medium">
                  Bottom {side}
                  {on && <Check className="size-4 text-primary" aria-hidden />}
                </span>
              </button>
            );
          })}
        </div>
      </FormField>
      {appearanceFooter}
    </FormSection>
  );

  const conversation = (
    <FormSection
      title={<><MessageSquareText aria-hidden /> Conversation</>}
      description="What visitors read first, and how the counsellor should answer."
      columns={1}
    >
      <FormField label="Greeting" htmlFor="widget-greeting" optional hint={counter(form.greeting.length, 300)}>
        <Textarea id="widget-greeting" value={form.greeting} onChange={set("greeting")} maxLength={300} rows={2} placeholder="Hi! Ask me anything about studying with us." />
      </FormField>
      <FormField
        label="Custom instructions"
        htmlFor="widget-instructions"
        optional
        hint="Extra guidance for every answer. Instructions that try to override the counsellor's behaviour are ignored."
      >
        <Textarea id="widget-instructions" value={form.custom_instructions} onChange={set("custom_instructions")} rows={3} placeholder="e.g. Always mention our February and July intakes." />
      </FormField>
    </FormSection>
  );

  return (
    <>
      {identity}
      {conversation}
      {appearance}
    </>
  );
}

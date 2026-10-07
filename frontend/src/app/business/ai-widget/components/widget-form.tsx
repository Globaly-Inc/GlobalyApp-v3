"use client";

import { Check, MessageSquareText, Palette, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function Section({ icon: Icon, title, hint, children }: Readonly<{ icon: LucideIcon; title: string; hint: string; children: React.ReactNode }>) {
  return (
    <section className="flex flex-col gap-4 border-b p-5 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Label row: name, a muted "Optional", and a character count when the field has a cap. */
function FieldLabel({ htmlFor, id, optional, count, max, children }: Readonly<{
  htmlFor?: string; id?: string; optional?: boolean; count?: number; max?: number; children: React.ReactNode;
}>) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <Label htmlFor={htmlFor} id={id}>
        {children}
        {optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>}
      </Label>
      {max != null && <span className="text-xs text-muted-foreground tabular-nums">{count}/{max}</span>}
    </div>
  );
}

/** One settings card; scrolls inside itself when the editor is pinned to the screen's height. */
const CARD = "flex flex-col overflow-hidden rounded-2xl border bg-card xl:min-h-0 xl:overflow-y-auto";

/**
 * The widget's settings, controlled — the editor page owns the values so its preview can follow
 * them. Two cards (Identity + Conversation, then Appearance) that the editor lays out as its two
 * settings columns.
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
    <Section icon={UserRound} title="Identity" hint="How the counsellor introduces itself in the header.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="widget-name">Display name</FieldLabel>
          <Input id="widget-name" value={form.display_name} onChange={set("display_name")} placeholder="Acme University Counsellor" />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="widget-subtitle" optional count={form.subtitle.length} max={120}>Subtitle</FieldLabel>
          <Input id="widget-subtitle" value={form.subtitle} onChange={set("subtitle")} maxLength={120} placeholder="Usually replies in seconds" />
        </div>
      </div>
    </Section>
  );

  const appearance = (

    <Section icon={Palette} title="Appearance" hint="Aly, the launcher and every button take on your colour.">
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="widget-color-hex">Brand colour</FieldLabel>
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
                className={cn("flex size-8 items-center justify-center rounded-full text-white transition-transform hover:scale-110", on && "ring-2 ring-offset-2 ring-offset-card")}
                style={{ backgroundColor: hex, ...(on ? { ["--tw-ring-color" as string]: hex } : {}) }}
              >
                {on && <Check className="size-4" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel id="widget-position">Position on your website</FieldLabel>
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
                className={cn("flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors", on ? "border-2 border-primary bg-primary/5" : "hover:bg-muted/50")}
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
      </div>
    </Section>
  );

  const conversation = (
    <Section icon={MessageSquareText} title="Conversation" hint="What visitors read first, and how the counsellor should answer.">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="widget-greeting" optional count={form.greeting.length} max={300}>Greeting</FieldLabel>
        <Textarea id="widget-greeting" value={form.greeting} onChange={set("greeting")} maxLength={300} rows={2} placeholder="Hi! Ask me anything about studying with us." />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="widget-instructions" optional>Custom instructions</FieldLabel>
        <Textarea id="widget-instructions" value={form.custom_instructions} onChange={set("custom_instructions")} rows={3} placeholder="e.g. Always mention our February and July intakes." />
        <p className="text-xs text-muted-foreground">
          Extra guidance for every answer. Instructions that try to override the counsellor&apos;s behaviour are ignored.
        </p>
      </div>
    </Section>
  );

  return (
    <>
      <div className={CARD}>
        {identity}
        {conversation}
      </div>
      <div className={CARD}>
        {appearance}
        {appearanceFooter}
      </div>
    </>
  );
}

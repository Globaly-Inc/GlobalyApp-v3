"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
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
  monthly_credit_limit: "1000",
};
export type WidgetFormValues = typeof EMPTY_WIDGET_FORM;

export const formFromConfig = (c: EmbedConfig): WidgetFormValues => ({
  display_name: c.display_name ?? "",
  brand_color: c.brand_color ?? EMPTY_WIDGET_FORM.brand_color,
  position: c.position ?? "right",
  greeting: c.greeting ?? "",
  subtitle: c.subtitle ?? "",
  custom_instructions: c.custom_instructions ?? "",
  monthly_credit_limit: String(c.monthly_credit_limit),
});

const text = (v: string) => v.trim() || undefined;
const limitOf = (form: WidgetFormValues) => Number(form.monthly_credit_limit) || undefined;

export const toCreateInput = (form: WidgetFormValues): CreateEmbedConfigInput => ({
  display_name: text(form.display_name),
  brand_color: form.brand_color || undefined,
  position: form.position,
  greeting: text(form.greeting),
  subtitle: text(form.subtitle),
  custom_instructions: text(form.custom_instructions),
  monthly_credit_limit: limitOf(form),
});

/** Edit: an emptied field is cleared, not left as it was. */
export const toUpdateInput = (form: WidgetFormValues): UpdateEmbedConfigInput => ({
  display_name: text(form.display_name) ?? null,
  brand_color: form.brand_color || null,
  position: form.position,
  greeting: text(form.greeting) ?? null,
  subtitle: text(form.subtitle) ?? null,
  custom_instructions: text(form.custom_instructions) ?? null,
  monthly_credit_limit: limitOf(form),
});

/** The widget's settings, controlled — the editor page owns the values so its preview can follow them. */
export function WidgetFormFields({
  form,
  setForm,
}: Readonly<{ form: WidgetFormValues; setForm: React.Dispatch<React.SetStateAction<WidgetFormValues>> }>) {
  const set =
    (key: keyof WidgetFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="widget-color">Brand colour</Label>
        {/* No logo upload: every widget shows Aly, in this colour. */}
        <div className="flex items-center gap-3">
          <Input
            id="widget-color"
            type="color"
            value={form.brand_color}
            onChange={set("brand_color")}
            className="h-10 w-20 p-1"
          />
          <AlyOrbIcon className="size-8" color={form.brand_color} />
          <span className="text-xs text-muted-foreground">Aly takes on this colour in your widget.</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label id="widget-position">Position on your website</Label>
        {/* A segmented control, like tabs: one pill on a muted track. */}
        <div role="radiogroup" aria-labelledby="widget-position" className="inline-flex w-fit rounded-lg bg-muted p-1">
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={form.position === side}
              onClick={() => setForm((f) => ({ ...f, position: side }))}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                form.position === side ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Bottom {side}
            </button>
          ))}
        </div>
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
  );
}

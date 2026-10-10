"use client";

import { Label } from "@/components/ui/label";
import { ToggleRow } from "./setting-row";
import { CustomFields } from "./custom-fields";
import { COLLECTABLE_FIELDS, CONTACT_FIELDS } from "../apis/types";
import { FIELD_CAUTION, FIELD_LABEL } from "../const";
import type { CollectableField, CollectionRules } from "../apis/types";

/** Everything except the contact fields, which are fixed and stated on their own above. */
const OPTIONAL_FIELDS = COLLECTABLE_FIELDS.filter(
  (f) => !(CONTACT_FIELDS as readonly string[]).includes(f),
);

/**
 * What the counsellor may record about a visitor, and what it may ask for outright.
 *
 * Three states per field rather than a single on/off, because they are genuinely different
 * instructions to the model: off means never write it down, on means record it if offered, and
 * "may ask" means it can raise the subject itself. The distinction is the whole point of §5 —
 * an AI should not collect something merely because it can.
 *
 * Sensitive is the fourth state and sits apart: usable to answer the question in front of it,
 * never persisted.
 *
 * Contact details are states like everything else. They were briefly a fixed statement here,
 * backed by a transform that forced them into `allowed` on every parse — which silently
 * overrode saved opt-outs and left no way to turn a phone number off. Switching `email` off now
 * also suppresses the contact card, since asking for an address we may not keep is worse than
 * not asking.
 */
export function CollectionCard({
  collection, onChange, disabled,
}: Readonly<{
  collection: CollectionRules;
  onChange: (next: Partial<CollectionRules>) => void;
  disabled: boolean;
}>) {
  const toggle = (list: CollectableField[], field: CollectableField): CollectableField[] =>
    list.includes(field) ? list.filter((f) => f !== field) : [...list, field];

  const setAllowed = (field: CollectableField) => {
    const allowed = toggle(collection.allowed, field);
    // Turning a field off must also drop it from the two lists that qualify it, or the prompt
    // would be told both to never record it and to ask for it outright.
    onChange({
      allowed,
      may_ask_for: collection.may_ask_for.filter((f) => allowed.includes(f)),
      sensitive: collection.sensitive.filter((f) => allowed.includes(f)),
    });
  };

  return (
    <div className="rounded-lg border p-5">
      <h2 className="text-sm font-semibold">What it may collect</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
        Contact details are always kept. Of the rest, anything switched off is never written
        down, even if a visitor volunteers it, and your counsellor only asks outright for what
        you tick as &ldquo;may ask&rdquo;.
      </p>

      <div className="flex flex-col gap-2.5">
        <div className="rounded-md border bg-muted/40 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm">
              {CONTACT_FIELDS.map((f) => FIELD_LABEL[f] ?? f).join(", ")}
            </Label>
            <span className="text-xs text-muted-foreground">Always recorded</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recorded whenever a visitor gives them — they are how anyone follows up. When your
            counsellor asks for them is set under &ldquo;Asking for contact details&rdquo;.
          </p>
        </div>

        {OPTIONAL_FIELDS.map((field) => {
          const on = collection.allowed.includes(field);
          return (
            <div key={field} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5">
              <div className="min-w-0">
                <Label className="text-sm">{FIELD_LABEL[field] ?? field}</Label>
                {!on && FIELD_CAUTION[field] && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{FIELD_CAUTION[field]}</p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer accent-primary"
                    checked={on}
                    disabled={disabled}
                    onChange={() => setAllowed(field)}
                  />
                  Record
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer accent-primary disabled:opacity-40"
                    checked={collection.may_ask_for.includes(field)}
                    disabled={disabled || !on}
                    onChange={() => onChange({ may_ask_for: toggle(collection.may_ask_for, field) })}
                  />
                  May ask
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer accent-primary disabled:opacity-40"
                    checked={collection.sensitive.includes(field)}
                    disabled={disabled || !on}
                    onChange={() => onChange({ sensitive: toggle(collection.sensitive, field) })}
                  />
                  Sensitive
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <CustomFields
        fields={collection.custom}
        disabled={disabled}
        onChange={(custom) => onChange({ custom })}
      />

      <div className="mt-4">
        <ToggleRow
          label="Offer to email a summary"
          hint="Your counsellor asks for a name and email at a natural point in longer conversations."
          checked={collection.contact_ask.enabled}
          disabled={disabled}
          onChange={(enabled) => onChange({ contact_ask: { ...collection.contact_ask, enabled } })}
        />
      </div>
    </div>
  );
}

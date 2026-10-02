"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CUSTOM_FIELD_MAX, type CustomField } from "../apis/types";

/**
 * Subjects this institution collects that the fixed vocabulary has no name for.
 *
 * Two states per field rather than the three above, and the missing one is deliberate: a field
 * someone typed in exists because they want it recorded, so "record" is not a question — only
 * whether the counsellor may raise it itself. "Sensitive" means use it but never store it, which
 * would leave a field that collects nothing.
 *
 * The storage key is minted ONCE, here, and travels with the field from then on. The random tail
 * is the load-bearing part: without it, removing "Budget" and later adding it again would mint
 * `budget` a second time, and every answer stored under the first one would walk back into the
 * counsellor's notes for a visitor who gave it months ago. A removed field's key is never
 * reissued, so its rows are orphaned rather than resurrected.
 *
 * The slug is only there to make a key readable in a prompt and a query; `field` stands in when a
 * label has no a-z to slug, which a label in another script legitimately may not.
 */
const mintKey = (label: string) => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 34);
  // padEnd before slice: Math.random() occasionally renders short ("0.i"), and a one-character
  // tail is a tail that can collide.
  const tail = Math.random().toString(36).slice(2).padEnd(4, "0").slice(0, 4);
  return `${slug || "field"}_${tail}`;
};

export function CustomFields({
  fields, onChange, disabled,
}: Readonly<{
  fields: CustomField[];
  onChange: (next: CustomField[]) => void;
  disabled: boolean;
}>) {
  const [label, setLabel] = useState("");

  const name = label.trim().replace(/\s+/g, " ");
  // Keys are unique by construction now, so what is checked here is the LABEL: two fields called
  // "Budget" would be two prompts for one thing. A disabled button rather than an error, because
  // the field already on screen says what is wrong.
  const canAdd = !!name
    && !fields.some((f) => f.label.toLowerCase() === name.toLowerCase())
    && fields.length < CUSTOM_FIELD_MAX;

  const add = () => {
    if (!canAdd) return;
    onChange([...fields, { key: mintKey(name), label: name, may_ask: false }]);
    setLabel("");
  };

  return (
    <div className="mt-4 border-t pt-4">
      <Label className="text-sm">Your own fields</Label>
      <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
        Anything the list above has no name for — a preferred intake, a budget, how they heard
        about you. Your counsellor records what a visitor says about it, and asks for it only if
        you tick &ldquo;may ask&rdquo;.
      </p>

      {fields.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2.5">
          {fields.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5">
              <Label className="min-w-0 text-sm">{f.label}</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer accent-primary"
                    checked={f.may_ask}
                    disabled={disabled}
                    onChange={() => onChange(fields.map((x) => (
                      x.key === f.key ? { ...x, may_ask: !x.may_ask } : x
                    )))}
                  />
                  May ask
                </label>
                <Button
                  size="icon" variant="ghost" className="size-7" disabled={disabled}
                  aria-label={`Remove ${f.label}`}
                  title="Remove. Answers already given stay on those visitors' records but are never used again — adding this field back starts it empty."
                  onClick={() => onChange(fields.filter((x) => x.key !== f.key))}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-10 w-full sm:w-72"
          placeholder="Name a field, e.g. Preferred intake"
          maxLength={60}
          value={label}
          disabled={disabled || fields.length >= CUSTOM_FIELD_MAX}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button variant="outline" disabled={disabled || !canAdd} onClick={add}>
          <Plus className="size-3.5" />
          Add field
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {fields.length >= CUSTOM_FIELD_MAX
          ? `That is the limit of ${CUSTOM_FIELD_MAX}. Remove one to add another.`
          : "Saved with the rest of this page."}
      </p>
    </div>
  );
}

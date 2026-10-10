"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AUTHORABLE_TYPES, MEMORY_TYPE_META } from "../const";
import type { CreateMemoryInput, Memory, MemoryType, PatchMemoryInput } from "../apis/types";

/** One statement, max 600 characters — the backend's own limit, enforced here so a long one
 *  fails in the form rather than as a 400 after the user has written it. */
const MAX_CONTENT = 600;

/** The backend's `Short` — every metadata string it accepts. */
const MAX_SHORT = 300;

/**
 * The fields. Mounted fresh per open via a `key` on the caller below, so its state initialises
 * from props and there is no reset effect — a cancelled edit cannot leak into the next create.
 */
function MemoryForm({
  onCreate, onUpdate, onDone, onCancel, initial, saving,
}: Readonly<{
  onCreate: (input: CreateMemoryInput) => Promise<boolean>;
  onUpdate: (id: string, input: PatchMemoryInput) => Promise<boolean>;
  onDone: () => void;
  onCancel: () => void;
  initial?: Memory;
  saving: boolean;
}>) {
  const [type, setType] = useState<MemoryType>(initial?.type ?? "COUNSELLING_GUIDELINE");
  const [content, setContent] = useState(initial?.content ?? "");
  const [important, setImportant] = useState((initial?.importance ?? 3) === 5);
  // TERMINOLOGY is the one authorable type whose metadata the backend REQUIRES — `{term, meaning}`,
  // both non-empty. Every other authorable type's metadata is all-optional, which is why this is
  // two conditional fields rather than a per-type form registry.
  const [term, setTerm] = useState(String(initial?.metadata?.term ?? ""));
  const [meaning, setMeaning] = useState(String(initial?.metadata?.meaning ?? ""));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = content.trim();
    if (trimmed.length < 3) return setError("Write the rule as a sentence.");
    if (trimmed.length > MAX_CONTENT) return setError(`Keep it under ${MAX_CONTENT} characters — one rule per entry.`);
    const isTerm = (initial?.type ?? type) === "TERMINOLOGY";
    if (isTerm && (!term.trim() || !meaning.trim())) {
      return setError("A wording rule needs both the word and what it means.");
    }
    setError(null);
    const importance = important ? 5 : 3;
    // Spread what the row already carried: the patch path REPLACES metadata (it re-parses the
    // whole object per type), so sending only these two would drop `use_instead_of` — which the
    // extractor writes and this form does not offer.
    const metadata = isTerm
      ? { ...initial?.metadata, term: term.trim(), meaning: meaning.trim() }
      : undefined;
    const ok = initial
      ? await onUpdate(initial.id, { content: trimmed, importance, ...(metadata && { metadata }) })
      : await onCreate({ type, content: trimmed, importance, ...(metadata && { metadata }) });
    if (ok) onDone();
    else setError("That didn't save. Try again.");
  };

  const hint = MEMORY_TYPE_META[type]?.hint;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{initial ? "Edit this rule" : "Teach your counsellor"}</DialogTitle>
        <DialogDescription>
          One instruction per entry, written the way you would tell a new counsellor. It goes
          into use straight away.
        </DialogDescription>
      </DialogHeader>

      {/* flex+gap, never space-y — base-ui's focus guards inflate a space-y parent when the
          Combobox popover opens. */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="memory-content">Kind</Label>
          {initial ? (
            <p className="text-sm text-muted-foreground">
              {MEMORY_TYPE_META[initial.type]?.label ?? initial.type} — a different kind is a
              different rule, so this one stays as it is.
            </p>
          ) : (
            <Combobox
              options={AUTHORABLE_TYPES.map((t) => ({ value: t, label: MEMORY_TYPE_META[t].label }))}
              value={type}
              onChange={(next) => setType(next as MemoryType)}
              placeholder="Pick a kind"
            />
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>

        {(initial?.type ?? type) === "TERMINOLOGY" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="memory-term">The word</Label>
              <Input
                id="memory-term"
                value={term}
                maxLength={MAX_SHORT}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Foundation year"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="memory-meaning">What it means</Label>
              <Input
                id="memory-meaning"
                value={meaning}
                maxLength={MAX_SHORT}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="Our one-year pre-degree programme"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="memory-content">The rule</Label>
          <Textarea
            id="memory-content"
            rows={4}
            value={content}
            maxLength={MAX_CONTENT}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Always confirm the applicant's highest completed qualification before suggesting a postgraduate course."
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {content.trim().length} / {MAX_CONTENT}
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 cursor-pointer accent-primary"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
          />
          <span>
            Apply this to every reply
            <span className="block text-xs text-muted-foreground">
              Otherwise it is used when it fits the visitor&apos;s question. Keep the
              every-reply list short — it is part of every answer.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add rule"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Write a rule, or reword one.
 *
 * Only `content`, `type`, importance and — for a wording rule — its required `{term, meaning}`
 * are offered. The lifecycle columns — status, confidence, provenance — are the system's to set,
 * and a form that let someone type a confidence would be inventing evidence.
 *
 * Type is fixed when editing: the backend treats a different type as a different memory, and
 * silently re-filing someone's rule under a new one is worse than making them write it again.
 */
export function MemoryFormDialog({
  open, onOpenChange, onCreate, onUpdate, initial, saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateMemoryInput) => Promise<boolean>;
  onUpdate: (id: string, input: PatchMemoryInput) => Promise<boolean>;
  initial?: Memory;
  saving: boolean;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <MemoryForm
            key={initial?.id ?? "new"}
            initial={initial}
            saving={saving}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

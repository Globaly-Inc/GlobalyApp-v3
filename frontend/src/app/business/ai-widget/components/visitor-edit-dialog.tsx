"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { isValidEmail } from "@/app/admin/platform/businesses/utils";
import type { Country } from "@/app/geo/apis";
import type { VisitorPatch, WidgetVisitor } from "../apis/types";

type Form = {
  name: string; email: string; age: string;
  gender: string; nationality: string; study_preference: string;
};

function formFrom(visitor: WidgetVisitor): Form {
  return {
    name: visitor.name ?? "",
    email: visitor.email ?? "",
    age: visitor.age ?? "",
    gender: visitor.gender ?? "",
    nationality: visitor.nationality ?? "",
    study_preference: visitor.study_preference ?? "",
  };
}

type EditFormProps = Readonly<{
  visitor: WidgetVisitor;
  countries: Country[];
  saving: boolean;
  onSave: (patch: VisitorPatch) => Promise<boolean>;
  onClose: () => void;
}>;

function EditForm({ visitor, countries, saving, onSave, onClose }: EditFormProps) {
  // Seeded once, on mount. The dialog unmounts this when it closes, so reopening always starts
  // from the row as it is now — without a reset-in-effect, which the React Compiler rejects and
  // which would also stamp on a save that landed while the dialog was open.
  const [form, setForm] = useState<Form>(() => formFrom(visitor));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const patch: VisitorPatch = {};
    const next: Partial<Record<keyof Form, string>> = {};

    if (name !== (visitor.name ?? "") || email !== (visitor.email ?? "")) {
      // Both or neither. Caught here rather than left to the server's 400, because "name and
      // email must move together" only means anything next to the two fields it is about.
      if (!!name !== !!email) {
        if (!name) next.name = "Add a name too — a contact needs both.";
        if (!email) next.email = "Add an email too — a contact needs both.";
      } else if (email && !isValidEmail(email)) {
        next.email = "Enter a valid email address.";
      } else {
        patch.name = name || null;
        patch.email = email || null;
      }
    }

    for (const key of ["age", "gender", "nationality", "study_preference"] as const) {
      const value = form[key].trim();
      if (value !== (visitor[key] ?? "")) patch[key] = value || null;
    }

    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    // Nothing actually changed — closing is the honest response, not a request.
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }
    if (await onSave(patch)) onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit visitor details</DialogTitle>
        <DialogDescription>
          Corrections to what the assistant recorded. The visitor&apos;s own later messages still
          win — if they restate their age or nationality in a new chat, that replaces this.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visitor-name">Full name</Label>
          <Input id="visitor-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Not given" />
          <FieldError message={errors.name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visitor-email">Email</Label>
          <Input id="visitor-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Not given" />
          <FieldError message={errors.email} />
        </div>
        <div className="flex flex-col gap-1.5">
          {/* Free text, verbatim: there is no age-group list on this platform, and the column
              holds exactly what was said ("22", "early 30s"). */}
          <Label htmlFor="visitor-age">Age</Label>
          <Input id="visitor-age" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="e.g. 22" />
        </div>
        <div className="flex flex-col gap-1.5">
          {/* Also free text, deliberately not a fixed list — the platform's own profile column is
              free text, so a dropdown here would reject a self-description it accepts. */}
          <Label htmlFor="visitor-gender">Gender</Label>
          <Input id="visitor-gender" value={form.gender} onChange={(e) => set("gender", e.target.value)} placeholder="Not given" />
        </div>
        <div className="flex flex-col gap-1.5">
          {/* A real country name, because that is what the extractor resolves to. Free text here
              would let the portal store a value the chat side could never produce. */}
          <Label>Nationality</Label>
          <Combobox
            options={[{ value: "", label: "— None —" }, ...countries.map((c) => ({ value: c.name, label: c.name }))]}
            value={form.nationality}
            onChange={(value) => set("nationality", value)}
            placeholder="Not given"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visitor-course">Study preference</Label>
          <Input
            id="visitor-course"
            value={form.study_preference}
            onChange={(e) => set("study_preference", e.target.value)}
            placeholder="The course they asked about"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </DialogFooter>
    </>
  );
}

/**
 * Only the fields the visitor stated about themselves, in ONE dialog rather than one per card.
 *
 * Splitting name and email across two dialogs is what would break this: the table's CHECK
 * forbids half a contact, so the two must be edited in the same form or a save can produce a row
 * Postgres refuses. Both the Personal and Contact cards open this same dialog.
 */
export function VisitorEditDialog({
  open,
  onOpenChange,
  visitor,
  countries,
  saving,
  onSave,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitor: WidgetVisitor;
  countries: Country[];
  saving: boolean;
  onSave: (patch: VisitorPatch) => Promise<boolean>;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <EditForm
            visitor={visitor}
            countries={countries}
            saving={saving}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

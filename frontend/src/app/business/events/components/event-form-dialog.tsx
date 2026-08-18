"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppDispatch } from "@/lib/hooks";
import type { BusinessEvent } from "../apis";
import { EMPTY_EVENT_FORM, formFromEvent, formToInput, validateEventForm } from "../utils/event-form";
import type { EventForm } from "../utils/event-form";
import { createBusinessEvent, updateBusinessEvent } from "../store/business-events-slice";
import { EventFormFields } from "./event-form-fields";

/** Create a new event, or edit an existing one. Same fields either way. */
export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; event: BusinessEvent | null }>) {
  const dispatch = useAppDispatch();
  const isEdit = !!event;

  const [form, setForm] = useState<EventForm>(EMPTY_EVENT_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof EventForm, string>>>({});
  const [saving, setSaving] = useState(false);

  // Re-seed when the sheet opens, or when a different event is handed in while it is
  // open. Derived by comparing against the previous props during render — seeding from
  // an effect would commit one render of the stale form first.
  const seedFor = open ? (event ?? null) : undefined;
  const [seededFor, setSeededFor] = useState<BusinessEvent | null | undefined>(undefined);
  if (seedFor !== seededFor && open) {
    setForm(event ? formFromEvent(event) : EMPTY_EVENT_FORM);
    setErrors({});
  }
  if (seedFor !== seededFor) setSeededFor(seedFor);

  const set = <K extends keyof EventForm>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const handleSave = async () => {
    const nextErrors = validateEventForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const input = formToInput(form);
      if (event) {
        await dispatch(updateBusinessEvent({ eventId: event.id, patch: input })).unwrap();
        toast.success("Event updated");
      } else {
        await dispatch(createBusinessEvent(input)).unwrap();
        toast.success("Event created", { description: `${input.title} is now a ${input.status} event.` });
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(isEdit ? "Couldn't update event" : "Couldn't create event", {
        description: (e as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit event" : "New event"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the details attendees see. Publishing makes it visible to everyone."
              : "Drafts stay private until you publish them."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <EventFormFields form={form} errors={errors} onChange={set} />
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create event"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/lib/hooks";
import type { EventTicket } from "../apis";
import { MAX_TICKETS_PER_ORDER, TICKET_CURRENCY_OPTIONS } from "../const";
import {
  EMPTY_TICKET_FORM,
  formFromTicket,
  formToTicketInput,
  validateTicketForm,
} from "../utils/ticket-form";
import type { TicketForm } from "../utils/ticket-form";
import { createEventTicket, updateEventTicket } from "../store/business-events-slice";

/** Create or edit one ticket type. `flex flex-col gap-*` everywhere — Combobox breaks under `space-y-*`. */
export function TicketFormDialog({
  open,
  onOpenChange,
  eventId,
  ticket,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: number;
  ticket: EventTicket | null;
}>) {
  const dispatch = useAppDispatch();
  const isEdit = !!ticket;

  const [form, setForm] = useState<TicketForm>(EMPTY_TICKET_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof TicketForm, string>>>({});
  const [saving, setSaving] = useState(false);

  // Seeded during render off the previous props, never from an effect.
  const seedFor = open ? (ticket ?? null) : undefined;
  const [seededFor, setSeededFor] = useState<EventTicket | null | undefined>(undefined);
  if (seedFor !== seededFor && open) {
    setForm(ticket ? formFromTicket(ticket) : EMPTY_TICKET_FORM);
    setErrors({});
  }
  if (seedFor !== seededFor) setSeededFor(seedFor);

  const set = <K extends keyof TicketForm>(key: K, value: TicketForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const handleSave = async () => {
    const nextErrors = validateTicketForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const input = formToTicketInput(form);
      if (ticket) {
        await dispatch(updateEventTicket({ eventId, ticketId: ticket.id, patch: input })).unwrap();
        toast.success("Ticket updated");
      } else {
        await dispatch(createEventTicket({ eventId, input })).unwrap();
        toast.success("Ticket added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(isEdit ? "Couldn't update ticket" : "Couldn't add ticket", {
        description: (e as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit ticket" : "Add ticket"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticket-name">Name</Label>
            <Input
              id="ticket-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="General admission"
              aria-invalid={!!errors.name}
            />
            <FieldError message={errors.name} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea
              id="ticket-description"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-price">Price</Label>
              <Input
                id="ticket-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                aria-invalid={!!errors.price}
              />
              <p className="text-xs text-muted-foreground">Zero makes it a free RSVP ticket.</p>
              <FieldError message={errors.price} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-currency">Currency</Label>
              <Combobox
                id="ticket-currency"
                options={TICKET_CURRENCY_OPTIONS}
                value={form.currency}
                onChange={(v) => set("currency", v)}
                creatable
                searchPlaceholder="Search or type a code"
              />
              <FieldError message={errors.currency} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-quantity">Capacity</Label>
              <Input
                id="ticket-quantity"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                placeholder="Unlimited"
                aria-invalid={!!errors.quantity}
              />
              <p className="text-xs text-muted-foreground">
                {ticket
                  ? `Cannot go below the ${ticket.claimed_count} seat${ticket.claimed_count === 1 ? "" : "s"} already claimed.`
                  : "Leave blank for unlimited."}
              </p>
              <FieldError message={errors.quantity} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-max-per-order">Max per order</Label>
              <Input
                id="ticket-max-per-order"
                type="number"
                min={1}
                max={MAX_TICKETS_PER_ORDER}
                value={form.max_per_order}
                onChange={(e) => set("max_per_order", e.target.value)}
                aria-invalid={!!errors.max_per_order}
              />
              <FieldError message={errors.max_per_order} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-sale-starts">Sales open</Label>
              <Input
                id="ticket-sale-starts"
                type="datetime-local"
                value={form.sale_starts_at}
                onChange={(e) => set("sale_starts_at", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-sale-ends">Sales close</Label>
              <Input
                id="ticket-sale-ends"
                type="datetime-local"
                value={form.sale_ends_at}
                onChange={(e) => set("sale_ends_at", e.target.value)}
                aria-invalid={!!errors.sale_ends_at}
              />
              <FieldError message={errors.sale_ends_at} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-sort-order">Display order</Label>
              <Input
                id="ticket-sort-order"
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => set("sort_order", e.target.value)}
                aria-invalid={!!errors.sort_order}
              />
              <FieldError message={errors.sort_order} />
            </div>
            <div className="flex items-center gap-2 self-end pb-1.5">
              <Switch
                id="ticket-active"
                checked={form.is_active}
                onCheckedChange={(checked) => set("is_active", checked)}
              />
              <Label htmlFor="ticket-active">On sale</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

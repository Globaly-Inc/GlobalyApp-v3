"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessEventsApi } from "../apis";
import type { TicketItem } from "../apis/types";

const EMPTY_TICKET = { name: "", price: "0", quantity: "" };

/** Ticket name/capacity/price only — no Stripe fields, no payment processing.
 * ponytail: fetched independently of the parent form since it only makes sense
 * once an event id exists. */
export function EventTicketManager({ eventId }: Readonly<{ eventId: number }>) {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [draft, setDraft] = useState(EMPTY_TICKET);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    businessEventsApi.listTickets(eventId).then(setTickets);
  }, [eventId]);

  const addTicket = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const created = await businessEventsApi.createTicket(eventId, {
        name: draft.name.trim(),
        description: null,
        price: draft.price || "0",
        currency: "USD",
        quantity: draft.quantity ? Number(draft.quantity) : null,
        max_per_order: 10,
        is_active: true,
        sort_order: tickets.length,
      });
      setTickets((prev) => [...prev, created]);
      setDraft(EMPTY_TICKET);
    } finally {
      setSaving(false);
    }
  };

  const removeTicket = async (ticketId: number) => {
    await businessEventsApi.deleteTicket(eventId, ticketId);
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Tickets are bookkeeping only — no payment is processed for them.
      </p>

      {tickets.length > 0 && (
        <div className="space-y-2">
          {tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.currency} {t.price} · {t.sold_count}/{t.quantity ?? "∞"} sold
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeTicket(t.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ticket-name">Name</Label>
          <Input id="ticket-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ticket-price">Price</Label>
          <Input
            id="ticket-price"
            type="number"
            min={0}
            value={draft.price}
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ticket-qty">Capacity</Label>
          <Input
            id="ticket-qty"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
          />
        </div>
        <Button type="button" variant="outline" disabled={saving || !draft.name.trim()} onClick={addTicket}>
          Add ticket
        </Button>
      </div>
    </div>
  );
}

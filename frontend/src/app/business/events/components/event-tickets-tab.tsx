"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { DataTable } from "@/app/admin/monitoring/events/components/events-table";
import type { EventTicket } from "../apis";
import { TICKET_COLUMNS } from "../const";
import { deleteEventTicket, fetchEventTickets } from "../store/business-events-slice";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { TicketFormDialog } from "./ticket-form-dialog";

function priceLabel(ticket: EventTicket): string {
  return ticket.is_free ? "Free" : `${ticket.currency} ${ticket.price.toFixed(2)}`;
}

/** Ticket types for one event: add, edit, deactivate or delete. */
export function EventTicketsTab({ eventId }: Readonly<{ eventId: number }>) {
  const dispatch = useAppDispatch();
  const { tickets, ticketsStatus } = useAppSelector((state) => state.businessEvents);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventTicket | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventTicket | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Keyed on the event it was fetched for, so Strict Mode's double-invoke is a no-op.
  const fetchedFor = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedFor.current === eventId) return;
    fetchedFor.current = eventId;
    dispatch(fetchEventTickets(eventId));
  }, [dispatch, eventId]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await dispatch(deleteEventTicket({ eventId, ticketId: pendingDelete.id })).unwrap();
      toast.success("Ticket deleted");
      setPendingDelete(null);
    } catch (e) {
      toast.error("Couldn't delete ticket", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Seats are held from the moment someone starts checkout, so{" "}
          <strong className="font-medium text-foreground">claimed</strong> counts reservations as well as
          completed sales.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add ticket
        </Button>
      </div>

      <DataTable
        status={ticketsStatus}
        head={TICKET_COLUMNS}
        minWidth="760px"
        rows={tickets.map((t) => [
          <span key="n" className="font-medium text-foreground">
            {t.name}
          </span>,
          priceLabel(t),
          t.quantity === null ? "Unlimited" : String(t.quantity),
          String(t.claimed_count),
          t.remaining === null ? "Unlimited" : String(t.remaining),
          <Badge key="a" variant="secondary" className={t.is_active ? "" : "bg-muted text-muted-foreground"}>
            {t.is_active ? "on sale" : "inactive"}
          </Badge>,
          <span key="x" className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${t.name}`}
              onClick={() => {
                setEditing(t);
                setFormOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${t.name}`}
              onClick={() => setPendingDelete(t)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </span>,
        ])}
      />

      <TicketFormDialog open={formOpen} onOpenChange={setFormOpen} eventId={eventId} ticket={editing} />
      <ConfirmDeleteDialog
        open={!!pendingDelete}
        title="Delete ticket"
        body={
          pendingDelete && pendingDelete.claimed_count > 0 ? (
            <>
              <strong className="text-foreground">{pendingDelete.name}</strong> already has{" "}
              {pendingDelete.claimed_count} claimed seat
              {pendingDelete.claimed_count === 1 ? "" : "s"}, so it cannot be deleted — deactivate it instead
              to stop new sales.
            </>
          ) : (
            <>
              Delete <strong className="text-foreground">{pendingDelete?.name}</strong>? This cannot be undone.
            </>
          )
        }
        deleting={deleting}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

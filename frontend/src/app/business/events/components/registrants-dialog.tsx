"use client";

import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchRegistrants } from "../store/business-events-slice";
import type { Event } from "../apis/types";

export function RegistrantsDialog({ event, onOpenChange }: { event: Event | null; onOpenChange: (open: boolean) => void }) {
  const dispatch = useAppDispatch();
  const { registrantsByEvent, registrantsLoading } = useAppSelector((s) => s.businessEvents);

  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!event || loadedFor.current === event.id) return;
    loadedFor.current = event.id;
    dispatch(fetchRegistrants(event.id));
  }, [event, dispatch]);

  if (!event) return null;
  const registrants = registrantsByEvent[event.id] ?? [];
  const loading = registrantsLoading === event.id && registrants.length === 0;

  return (
    <Dialog open={event != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrants — {event.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {loading && (
            <>
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </>
          )}
          {!loading && registrants.length === 0 && <p className="text-sm text-muted-foreground">No registrants yet.</p>}
          {registrants.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-2">
              <div>
                <p className="text-sm font-medium">{r.attendee_name}</p>
                <p className="text-xs text-muted-foreground">{r.attendee_email}</p>
              </div>
              {r.status === "cancelled" && <span className="text-xs text-muted-foreground">Cancelled</span>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

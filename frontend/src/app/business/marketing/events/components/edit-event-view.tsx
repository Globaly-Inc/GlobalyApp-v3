"use client";

import { useEffect, useRef, useState } from "react";
import { businessEventsApi } from "../apis";
import { eventToFormState } from "../utils";
import type { EventFormState } from "../types";
import { EventForm } from "./event-form";

export function EditEventView({ eventId }: Readonly<{ eventId: number }>) {
  const [form, setForm] = useState<EventFormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessEventsApi
      .get(eventId)
      .then((event) => setForm(eventToFormState(event)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load event"));
  }, [eventId]);

  if (error) {
    return <p className="mx-auto max-w-3xl text-sm text-destructive">{error}</p>;
  }
  if (!form) {
    return <p className="mx-auto max-w-3xl text-sm text-muted-foreground">Loading event…</p>;
  }
  return <EventForm eventId={eventId} initial={form} />;
}

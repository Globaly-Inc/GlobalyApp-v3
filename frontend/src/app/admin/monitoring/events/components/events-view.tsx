"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchEvents } from "../store/events-slice";
import { EVENT_COLUMNS } from "../const";

export function EventsView() {
  const dispatch = useAppDispatch();
  const { events } = useAppSelector((state) => state.monitoringEvents);

  useEffect(() => {
    dispatch(fetchEvents());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Events</h1>
        <p className="text-muted-foreground mt-1">Events management — searchable list of platform events.</p>
      </div>

      <AdminRecordsCard columns={EVENT_COLUMNS} rows={events} />
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RegistrationItem } from "../apis/types";

export function EventRegistrantsTable({
  registrations,
  onToggleCheckIn,
  onCancel,
  busyId,
}: Readonly<{
  registrations: RegistrationItem[];
  onToggleCheckIn: (r: RegistrationItem) => void;
  onCancel: (r: RegistrationItem) => void;
  busyId: number | null;
}>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Ticket</th>
            <th className="px-4 py-2 font-medium">Qty</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 font-medium">{r.registrant_name}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.registrant_email}</td>
              <td className="px-4 py-3">{r.ticket_name ?? "—"}</td>
              <td className="px-4 py-3">{r.quantity}</td>
              <td className="px-4 py-3">
                <Badge variant={r.status === "cancelled" ? "destructive" : r.status === "checked_in" ? "default" : "outline"}>
                  {r.status.replace("_", " ")}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  {r.status !== "cancelled" && (
                    <Button variant="outline" size="sm" disabled={busyId === r.id} onClick={() => onToggleCheckIn(r)}>
                      {r.status === "checked_in" ? "Undo check-in" : "Check in"}
                    </Button>
                  )}
                  {r.status !== "cancelled" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === r.id}
                      onClick={() => onCancel(r)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

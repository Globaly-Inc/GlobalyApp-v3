"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { businessEventsApi } from "../apis";
import type { CoHostItem } from "../apis/types";

export function EventCoHostManager({ eventId }: Readonly<{ eventId: number }>) {
  const [coHosts, setCoHosts] = useState<CoHostItem[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    businessEventsApi.listCoHosts(eventId).then(setCoHosts);
  }, [eventId]);

  const invite = async () => {
    const id = Number(businessId);
    if (!id) return;
    setSaving(true);
    try {
      const created = await businessEventsApi.inviteCoHost(eventId, id);
      setCoHosts((prev) => [...prev, created]);
      setBusinessId("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Invite another business to co-host this event.</p>

      {coHosts.length > 0 && (
        <div className="space-y-2">
          {coHosts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{c.host_business_name}</span>
              <Badge variant={c.status === "accepted" ? "default" : c.status === "declined" ? "destructive" : "outline"}>
                {c.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Input
          placeholder="Business ID"
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          className="max-w-40"
        />
        <Button type="button" variant="outline" disabled={saving || !businessId} onClick={invite}>
          Invite
        </Button>
      </div>
    </div>
  );
}

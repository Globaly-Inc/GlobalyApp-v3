"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { WEBHOOK_EVENT_LABEL } from "../const";
import { dismissRevealedSecret, fetchWebhook, saveWebhook } from "../store/business-integrations-slice";
import type { WebhookEvent } from "../apis/types";

export function IntegrationsView() {
  const dispatch = useAppDispatch();
  const { settings, availableEvents, status, error, saving, saveError, revealedSecret } = useAppSelector(
    (s) => s.businessIntegrations,
  );

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchWebhook());
  }, [dispatch]);

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [active, setActive] = useState(true);
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (initialisedRef.current || !settings) return;
    initialisedRef.current = true;
    setUrl(settings.url);
    setEvents(settings.subscribed_events);
    setActive(settings.is_active);
  }, [settings]);

  const toggleEvent = (event: WebhookEvent) =>
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));

  const loading = status === "loading" && !settings;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">Send a signed webhook to your own system when things happen here.</p>
      </div>

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load webhook settings"}</p>
        </div>
      )}

      {revealedSecret && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div>
            <p className="font-medium">Webhook secret (shown once)</p>
            <code className="text-xs">{revealedSecret}</code>
            <p className="mt-1 text-xs text-muted-foreground">Copy this now — it verifies the signature on every delivery and won&apos;t be shown again.</p>
          </div>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => dispatch(dismissRevealedSecret())}>
            Dismiss
          </Button>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-system.example.com/webhooks/globaly" />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Send events for</Label>
            {availableEvents.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <Checkbox checked={events.includes(event)} onCheckedChange={() => toggleEvent(event)} />
                {WEBHOOK_EVENT_LABEL[event]}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>Active</Label>
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <Button
            className="self-start"
            disabled={saving || url.trim().length === 0}
            onClick={() => dispatch(saveWebhook({ url: url.trim(), subscribed_events: events, is_active: active }))}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

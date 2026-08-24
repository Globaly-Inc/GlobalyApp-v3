"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { businessEventsApi } from "../apis";
import type { UpdateItem } from "../apis/types";

export function EventUpdatesManager({ eventId }: Readonly<{ eventId: number }>) {
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    businessEventsApi.listUpdates(eventId).then(setUpdates);
  }, [eventId]);

  const post = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const created = await businessEventsApi.createUpdate(eventId, title.trim() || null, content.trim());
      setUpdates((prev) => [created, ...prev]);
      setTitle("");
      setContent("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Share an update with attendees…" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
        <Button type="button" variant="outline" className="self-start" disabled={saving || !content.trim()} onClick={post}>
          Post update
        </Button>
      </div>

      {updates.length > 0 && (
        <div className="space-y-2">
          {updates.map((u) => (
            <div key={u.id} className="rounded-md border border-border px-3 py-2 text-sm">
              {u.title && <p className="font-medium">{u.title}</p>}
              <p className="text-muted-foreground">{u.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

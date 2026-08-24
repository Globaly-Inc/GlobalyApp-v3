"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CreateEventInput } from "../apis/types";

export function CreateEventDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateEventInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");

  const canSubmit = title.trim().length > 0 && startAt.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      title: title.trim(),
      description: description.trim() || null,
      start_at: new Date(startAt).toISOString(),
      is_online: isOnline,
      meeting_url: isOnline ? meetingUrl.trim() || null : null,
      location: !isOnline ? location.trim() || null : null,
      capacity: capacity ? Number(capacity) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-title">Title</Label>
            <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study in Australia — Info Session" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="event-description">Description</Label>
            <Textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="event-start">Starts at</Label>
            <Input id="event-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant={isOnline ? "default" : "outline"} size="sm" onClick={() => setIsOnline(true)}>
              Online
            </Button>
            <Button type="button" variant={!isOnline ? "default" : "outline"} size="sm" onClick={() => setIsOnline(false)}>
              In-person
            </Button>
          </div>

          {isOnline ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-url">Meeting URL</Label>
              <Input id="event-url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://…" />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-location">Location</Label>
              <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="event-capacity">Capacity (optional)</Label>
            <Input id="event-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Creating…" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

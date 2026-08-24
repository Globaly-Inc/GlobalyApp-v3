"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CreateCampaignInput } from "../apis/types";

export function CreateCampaignDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateCampaignInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [budget, setBudget] = useState("");

  const canSubmit = title.trim().length > 0 && Number(budget) > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      title: title.trim(),
      description: description.trim() || null,
      target_url: targetUrl.trim() || null,
      budget_minor: Math.round(Number(budget) * 100),
      currency: "USD",
      start_at: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ad campaign</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-title">Title</Label>
            <Input id="campaign-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Autumn Intake Push" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-description">Description</Label>
            <Textarea id="campaign-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-url">Landing page URL</Label>
            <Input id="campaign-url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-budget">Budget (USD)</Label>
            <Input id="campaign-budget" type="number" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="500.00" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Creating…" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

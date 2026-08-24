"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommissionType, CreateProgramInput } from "../apis/types";

const COMMISSION_TYPE_OPTIONS = [
  { value: "flat", label: "Flat amount per referral" },
  { value: "percentage", label: "Percentage of order value" },
];

export function CreateProgramDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateProgramInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [commissionType, setCommissionType] = useState<CommissionType>("flat");
  const [commissionValue, setCommissionValue] = useState("");

  const canSubmit = name.trim().length > 0 && Number(commissionValue) > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      name: name.trim(),
      description: description.trim() || null,
      commission_type: commissionType,
      commission_value: Number(commissionValue),
      currency: "USD",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ambassador program</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="program-name">Program name</Label>
            <Input id="program-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campus Ambassador Program" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="program-description">Description</Label>
            <Textarea
              id="program-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What ambassadors do and who can apply"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Commission type</Label>
            <Combobox
              options={COMMISSION_TYPE_OPTIONS}
              value={commissionType}
              onChange={(v) => setCommissionType(v as CommissionType)}
              placeholder="Select commission type"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="commission-value">
              {commissionType === "flat" ? "Amount per referral (USD)" : "Percentage of order value"}
            </Label>
            <Input
              id="commission-value"
              type="number"
              min={0}
              step="0.01"
              value={commissionValue}
              onChange={(e) => setCommissionValue(e.target.value)}
              placeholder={commissionType === "flat" ? "25.00" : "10"}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Creating…" : "Create program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { BusinessDetail, BusinessPatch } from "../../apis/types";

export function BusinessOverviewDialog({
  open,
  onOpenChange,
  business,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: BusinessDetail;
  onSave: (patch: BusinessPatch) => Promise<boolean>;
  saving: boolean;
}>) {
  const [description, setDescription] = useState(business.description ?? "");

  const handleOpenChange = (next: boolean) => {
    if (next) setDescription(business.description ?? "");
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const ok = await onSave({ description: description || null });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Description</DialogTitle>
        </DialogHeader>
        <RichTextEditor value={description} onChange={setDescription} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

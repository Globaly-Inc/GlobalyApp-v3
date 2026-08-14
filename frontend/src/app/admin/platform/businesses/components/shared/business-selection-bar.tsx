"use client";

import { CheckCircle, Loader2, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BusinessSelectionBar({
  count,
  bulkBusy,
  onClear,
  onVerify,
  onSuspend,
  onDeleteClick,
}: Readonly<{
  count: number;
  bulkBusy: boolean;
  onClear: () => void;
  onVerify: () => void;
  onSuspend: () => void;
  onDeleteClick: () => void;
}>) {
  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-xl">
      <span className="text-sm font-medium">{count} selected</span>
      <Button variant="ghost" size="sm" className="h-8 cursor-pointer" onClick={onClear}>
        Clear
      </Button>
      <span className="h-5 w-px bg-border" />
      <Button size="sm" variant="outline" className="h-8 cursor-pointer gap-1" disabled={bulkBusy} onClick={onVerify}>
        {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
        Verify
      </Button>
      <Button size="sm" variant="outline" className="h-8 cursor-pointer gap-1" disabled={bulkBusy} onClick={onSuspend}>
        {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
        Suspend
      </Button>
      <Button size="sm" variant="destructive" className="h-8 cursor-pointer gap-1" disabled={bulkBusy} onClick={onDeleteClick}>
        <Trash2 className="h-3 w-3" />
        Delete {count}
      </Button>
    </div>
  );
}

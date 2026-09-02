"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Search, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessMessagesApi } from "@/app/business/messages/apis";
import type { MemberCandidate } from "@/app/business/messages/apis";
import { initials } from "./utils";

/**
 * Adds colleagues to one enquiry thread — GlobalyOS V2's `AddSpaceMembersDialog` and its
 * `SearchableMemberPicker`, in Shadcn.
 *
 * Candidates come from the server, which returns only people already in this business and not
 * already on the thread. Filtering by hand here would let a stale list offer someone who has
 * since left, and the server would reject it — so the list is never assembled client-side.
 */
export function AddThreadMembersDialog({
  open,
  onOpenChange,
  distributionId,
  onAdded,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distributionId: string;
  onAdded: () => void;
}>) {
  const [candidates, setCandidates] = useState<MemberCandidate[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    businessMessagesApi
      .listMemberCandidates(distributionId)
      .then((r) => active && setCandidates(r.candidates))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [open, distributionId]);

  const handleOpenChange = (next: boolean) => {
    // Reset on close rather than on open: clearing here means the next open starts blank without
    // a flash of the previous selection while the fetch runs.
    if (!next) {
      setSelected([]);
      setQuery("");
      setError(null);
      setCandidates(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await businessMessagesApi.addMembers(distributionId, selected);
      onAdded();
      handleOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const term = query.trim().toLowerCase();
  const visible = (candidates ?? []).filter((c) =>
    term
      ? `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(term)
      : true,
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add people to this conversation</DialogTitle>
          <DialogDescription>
            They&apos;ll be able to read the full thread and reply to the student.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search your team..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {candidates === null && !error && (
              <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Loading your team…
              </p>
            )}
            {candidates !== null && visible.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                {candidates.length === 0
                  ? "Everyone in your business is already on this conversation."
                  : "Nobody matches that search."}
              </p>
            )}
            {visible.map((c) => {
              const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "Team member";
              const checked = selected.includes(c.platform_user_id);
              return (
                <Label
                  key={c.platform_user_id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 font-normal last:border-b-0 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      setSelected((prev) =>
                        next === true ? [...prev, c.platform_user_id] : prev.filter((id) => id !== c.platform_user_id),
                      )
                    }
                  />
                  <Avatar className="size-7 shrink-0">
                    {c.photo_url && <AvatarImage src={c.photo_url} alt="" className="object-cover" />}
                    <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    {c.email && <span className="block truncate text-xs text-muted-foreground">{c.email}</span>}
                  </span>
                </Label>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || selected.length === 0}>
            {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
            {saving ? "Adding…" : `Add${selected.length > 0 ? ` ${selected.length}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

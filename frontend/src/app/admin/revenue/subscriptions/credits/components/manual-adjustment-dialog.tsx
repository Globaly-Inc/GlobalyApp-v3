"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { useAppDispatch } from "@/lib/hooks";
import { creditsLedgerApi } from "../apis";
import type { UserSearchResult, AdjustInput } from "../apis/types";
import { applyAdjustment, fetchLedger } from "../store/credits-ledger-slice";

type OwnerRole = "platform" | "admin";

const OWNER_TYPES = [
  { value: "platform", label: "Platform users" },
  { value: "admin", label: "Admin users" },
];

export function ManualAdjustmentDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const [ownerRole, setOwnerRole] = useState<OwnerRole>("platform");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownerRoleRef = useRef(ownerRole);
  ownerRoleRef.current = ownerRole;

  const fetchUsers = useCallback(async (q: string, role: OwnerRole) => {
    setLoadingUsers(true);
    try {
      const results = await creditsLedgerApi.searchUsers(q, role);
      setUserResults(results);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Load defaults when dialog opens or role changes
  useEffect(() => {
    if (!open) return;
    setSelectedUserId("");
    setUserResults([]);
    fetchUsers("", ownerRole);
  }, [open, ownerRole, fetchUsers]);

  useEffect(() => {
    if (!open) {
      setOwnerRole("platform");
      setSelectedUserId("");
      setUserResults([]);
      setAmount("");
      setDescription("");
      setError(null);
    }
  }, [open]);

  const handleQueryChange = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(q, ownerRoleRef.current), 250);
  }, [fetchUsers]);

  const userOptions = userResults.map((u) => ({
    value: String(u.id),
    label: `${u.first_name} ${u.last_name}`,
    description: u.email,
  }));

  const handleSubmit = async () => {
    const parsedAmount = Number.parseInt(amount, 10);
    if (!selectedUserId) { setError("Please select a user"); return; }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount === 0) { setError("Enter a non-zero amount"); return; }
    if (!description.trim()) { setError("Description is required"); return; }

    const input: AdjustInput = {
      user_id: Number(selectedUserId),
      amount: parsedAmount,
      balance_type: "free",
      description: description.trim(),
    };

    setSaving(true);
    setError(null);
    const result = await dispatch(applyAdjustment(input));
    setSaving(false);

    if (applyAdjustment.fulfilled.match(result)) {
      dispatch(fetchLedger({}));
      onOpenChange(false);
    } else {
      setError("Adjustment failed. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual credit adjustment</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>User type</Label>
            <Combobox
              options={OWNER_TYPES}
              value={ownerRole}
              onChange={(v) => setOwnerRole(v as OwnerRole)}
              placeholder="Select owner type"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>User</Label>
            <Combobox
              options={userOptions}
              value={selectedUserId}
              onChange={(v) => setSelectedUserId(v)}
              onQueryChange={handleQueryChange}
              loading={loadingUsers}
              placeholder="Search and select a user..."
              searchPlaceholder="Search by name or email..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Amount (positive = grant, negative = deduct)</Label>
            <Input
              placeholder="e.g. 100 or -50"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Reason for adjustment..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-32"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSubmit} disabled={saving} className="w-full">
            {saving ? "Applying…" : "Apply adjustment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

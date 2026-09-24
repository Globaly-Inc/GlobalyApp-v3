"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceFeeForm } from "./service-fee-form";
import type { ServiceFee, ServiceFeeInput } from "../../../apis/types";

type FeeInstallmentLine = { fee_type: string; amount: number };
type FeeInstallment = { label: string; lines: FeeInstallmentLine[] };
const installmentsOf = (fee: ServiceFee) => fee.installments as unknown as FeeInstallment[];

function feeTotal(fee: ServiceFee) {
  return installmentsOf(fee).reduce((sum, i) => sum + i.lines.reduce((s, l) => s + l.amount, 0), 0);
}

function FeeCard({
  fee, onEdit, onDuplicate, onDelete,
}: Readonly<{ fee: ServiceFee; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }>) {
  const installmentCount = fee.installments.length;
  const total = Number(fee.total_amount) || feeTotal(fee);
  const avg = installmentCount > 0 ? total / installmentCount : total;
  const installments = installmentsOf(fee);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{fee.name || "Unnamed fee"}</span>
          <Badge className="text-xs capitalize">{fee.student_type}</Badge>
          <Badge variant="outline" className="text-xs">{fee.period_type}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" title="Duplicate fee" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Edit fee" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-destructive" title="Delete fee" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total fees</p>
            <p className="text-lg font-bold">{fee.currency} {total.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Installments</p>
            <p className="text-lg font-bold">{installmentCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg / installment</p>
            <p className="text-lg font-bold">~{fee.currency} {Math.round(avg).toLocaleString()}</p>
          </div>
        </div>

        {installments.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Breakdown</p>
            <div className="space-y-1.5">
              {installments.map((installment, i) => (
                <div key={`${installment.label}-${i}`} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">{installment.label}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {installment.lines.map((l, li) => (
                      <span key={`${l.fee_type}-${li}`}>{l.fee_type}: {fee.currency} {l.amount.toLocaleString()}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CourseFeesTab({ serviceId, isCourse = true }: Readonly<{ serviceId: string; isCourse?: boolean }>) {
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceFee | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.serviceFees.list(serviceId)
      .then(setFees)
      .finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (fee: ServiceFee) => { setEditing(fee); setFormOpen(true); };

  const handleSave = async (inputs: ServiceFeeInput[]) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await businessProfileDetailApi.serviceFees.update(serviceId, editing.id, inputs[0]!);
        setFees((f) => f.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Fee updated");
      } else {
        // allSettled, not all — the split (domestic + international) form fires two independent
        // creates; a failure on one must not discard a fee the other already created on the
        // server, or the user retries and gets a duplicate.
        const results = await Promise.allSettled(inputs.map((input) => businessProfileDetailApi.serviceFees.create(serviceId, input)));
        const created = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
        const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
        if (created.length > 0) setFees((f) => [...f, ...created]);
        if (failed) {
          toast.error(created.length > 0 ? "Only one fee was saved" : "Couldn't save fee", { description: (failed.reason as Error).message });
          return;
        }
        toast.success(created.length > 1 ? "Fees added" : "Fee added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save fee", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (fee: ServiceFee) => {
    try {
      const created = await businessProfileDetailApi.serviceFees.create(serviceId, {
        name: fee.name, student_type: fee.student_type, period_type: fee.period_type,
        currency: fee.currency, total_amount: Number(fee.total_amount), installments: fee.installments,
      });
      setFees((f) => [...f, created]);
      toast.success("Fee duplicated");
    } catch (e) {
      toast.error("Couldn't duplicate fee", { description: (e as Error).message });
    }
  };

  const handleDelete = async (feeId: number) => {
    try {
      await businessProfileDetailApi.serviceFees.remove(serviceId, feeId);
      setFees((f) => f.filter((x) => x.id !== feeId));
      toast.success("Fee removed");
    } catch (e) {
      toast.error("Couldn't remove fee", { description: (e as Error).message });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{fees.length} {isCourse ? "course fee" : "service fee"} structure{fees.length === 1 ? "" : "s"}</p>
        <Button className="gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add fee
        </Button>
      </div>

      {fees.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No fees configured yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {fees.map((fee) => (
            <FeeCard
              key={fee.id}
              fee={fee}
              onEdit={() => openEdit(fee)}
              onDuplicate={() => handleDuplicate(fee)}
              onDelete={() => handleDelete(fee.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
          <ServiceFeeForm fee={editing ?? undefined} saving={saving} isCourse={isCourse} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceFeeForm } from "./service-fee-form";
import { FeeCard, feeTotal, formatAmount } from "./fee-card";
import { TabSection } from "./tab-section";
import type { ServiceFee, ServiceFeeInput } from "../../../apis/types";

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

  const label = isCourse ? "course fee" : "service fee";
  // A student pays the fees for their own group plus the "both" ones — never domestic AND
  // international together. So one total per group (just "All students" when no fee is
  // group-specific), and no total for a group whose fees mix currencies.
  const split = fees.some((f) => f.student_type !== "both");
  const groups = (split ? (["domestic", "international"] as const) : (["both"] as const)).map((g) => {
    const own = fees.filter((f) => f.student_type === "both" || f.student_type === g);
    const currencies = new Set(own.map((f) => f.currency));
    return { g, own, currency: currencies.size === 1 ? own[0]?.currency ?? null : null, total: own.reduce((sum, f) => sum + feeTotal(f), 0) };
  }).filter((x) => x.own.length > 0);
  const GROUP_LABEL = { both: "All students", domestic: "Domestic students", international: "International students" };
  const summary = (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {groups.map(({ g, own, currency, total }) => (
        <div key={g} className="rounded-xl border bg-card px-4 py-3.5 sm:px-[18px]">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Estimated cost · {GROUP_LABEL[g]}</p>
          {currency ? (
            <p className="mt-1 font-heading text-[32px] leading-none font-bold tracking-[-0.015em]">
              <small className="mr-1.5 align-[6px] font-mono text-xs font-semibold tracking-normal text-muted-foreground">{currency}</small>
              <CountUp value={total} format={formatAmount} />
            </p>
          ) : (
            <p className="mt-1 font-heading text-2xl font-bold">Mixed currencies</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {own.length} fee structure{own.length === 1 ? "" : "s"} that apply to {GROUP_LABEL[g].toLowerCase()}
          </p>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <TabSection
        icon={Wallet}
        title={isCourse ? "Course fees" : "Service fees"}
        count={fees.length}
        addLabel="Add fee"
        onAdd={openAdd}
        loading={loading}
        emptyTitle={`No ${label}s yet`}
        emptyHint="Add a fee structure with its installments so students can see what they'll pay and when."
        summary={summary}
      >
        {fees.map((fee) => (
          <FeeCard
            key={fee.id}
            fee={fee}
            onEdit={() => openEdit(fee)}
            onDuplicate={() => handleDuplicate(fee)}
            onDelete={() => handleDelete(fee.id)}
          />
        ))}
      </TabSection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
          <ServiceFeeForm fee={editing ?? undefined} saving={saving} isCourse={isCourse} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}

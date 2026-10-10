"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { businessProfileDetailApi } from "../../../apis";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import { ServiceEligibilityForm } from "./service-eligibility-form";
import { TabSection } from "./tab-section";
import { EnglishTestBlock } from "./english-test-block";
import {
  APPLICABLE_TO_CHIP,
  academicTestValue,
  minScoreLabel,
  readAcademicTest,
  type EligibilityExtras,
} from "../eligibility-requirement-card";
import type { ServiceEligibility, ServiceEligibilityInput } from "../../../apis/types";

const BLOCK = "grid content-start gap-2 rounded-xl border p-3";
const BLOCK_LABEL = "text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground";
const KV = "flex items-baseline justify-between gap-2 text-[13px]";

export function EligibilityTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [degreeLevels, setDegreeLevels] = useState<Lookup[]>([]);
  const [rows, setRows] = useState<ServiceEligibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEligibility | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.getLookups("degree-levels").then((res) => setDegreeLevels(res.data));
    businessProfileDetailApi.serviceEligibility.list(serviceId).then(setRows).finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (row: ServiceEligibility) => { setEditing(row); setFormOpen(true); };

  const handleSave = async (input: ServiceEligibilityInput) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await businessProfileDetailApi.serviceEligibility.update(serviceId, editing.id, input);
        setRows((r) => r.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Eligibility requirement updated");
      } else {
        const created = await businessProfileDetailApi.serviceEligibility.create(serviceId, input);
        setRows((r) => [...r, created]);
        toast.success("Eligibility requirement added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save requirement", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceEligibility.remove(serviceId, id);
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Requirement removed");
    } catch (e) {
      toast.error("Couldn't remove requirement", { description: (e as Error).message });
    }
  };

  return (
    <>
      <TabSection
        icon={ShieldCheck}
        title="Eligibility"
        count={rows.length}
        addLabel="Add requirement"
        onAdd={openAdd}
        loading={loading}
        emptyTitle="No eligibility requirements yet"
        emptyHint="Set the academic minimums and English tests applicants need to meet."
        summary={
          <p className={BLOCK_LABEL}>
            {rows.length} requirement {rows.length === 1 ? "set" : "sets"}
          </p>
        }
      >
        {rows.map((row) => {
          const chip = APPLICABLE_TO_CHIP[row.applicable_to] ?? APPLICABLE_TO_CHIP.both;
          const academicTests = (row.academic_tests ?? []).map(readAcademicTest);
          // Extracted rows often carry only the scraped text forms — same fallbacks as the summary card.
          const degree = row.degree_level_id
            ? degreeLevels.find((d) => d.id === row.degree_level_id)?.name
            : (row as EligibilityExtras).min_degree_level;
          const score = minScoreLabel(row);
          const hasBlocks = Boolean(degree || score || academicTests.length || row.language_tests?.length);
          return (
            <article
              key={row.id}
              className="group/card rounded-xl border bg-card transition-[background-color,box-shadow] hover:bg-primary/[0.02] hover:shadow-md"
            >
              <div className="flex items-start gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
                  <ShieldCheck className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold">{row.name || "Untitled requirement"}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{chip.label}</span>
                  </div>
                  {row.description && <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{row.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-55 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
                  <Button size="icon-sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit requirement">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <ConfirmDeleteButton onConfirm={() => handleDelete(row.id)} />
                </div>
              </div>

              {hasBlocks && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5 px-4 pb-4">
                  {(degree || score) && (
                    <div className={BLOCK}>
                      <p className={BLOCK_LABEL}>Academic</p>
                      {degree && <div className={KV}><span className="text-muted-foreground">Minimum degree</span><span className="font-mono font-semibold">{degree}</span></div>}
                      {score && <div className={KV}><span className="text-muted-foreground">Minimum score</span><span className="font-mono font-semibold">{score}</span></div>}
                    </div>
                  )}
                  {academicTests.length > 0 && (
                    <div className={BLOCK}>
                      <p className={BLOCK_LABEL}>Admission tests</p>
                      {academicTests.map((t, i) => (
                        <div key={`${t.name}-${i}`} className={KV}>
                          <span className="text-muted-foreground">
                            {t.name}
                            {t.optional && <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-[10.5px] font-medium">optional</span>}
                          </span>
                          <span className="font-mono font-semibold">{academicTestValue(t) ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(row.language_tests ?? []).map((t, i) => (
                    <EnglishTestBlock key={`${String(t.test_type_name)}-${i}`} test={t} />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </TabSection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
          <ServiceEligibilityForm requirement={editing ?? undefined} degreeLevels={degreeLevels} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}

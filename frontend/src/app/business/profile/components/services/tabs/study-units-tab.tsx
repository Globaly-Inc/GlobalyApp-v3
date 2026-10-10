"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CountUp } from "@/components/count-up";
import { SegmentedControl } from "@/components/segmented-control";
import { TabSection } from "./tab-section";
import { StudyUnitRow } from "./study-unit-row";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceStudyUnitForm } from "./service-study-unit-form";
import type { ServiceStudyUnit, ServiceStudyUnitInput } from "../../../apis/types";

const UNIT_TYPE_LABELS: Record<string, string> = { compulsory: "Compulsory", elective: "Elective" };
const FILTERS = [
  { value: "all", label: "All" },
  { value: "compulsory", label: "Compulsory" },
  { value: "elective", label: "Elective" },
] as const;

export function StudyUnitsTab({ serviceId }: Readonly<{ serviceId: string }>) {
  const [rows, setRows] = useState<ServiceStudyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceStudyUnit | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.serviceStudyUnits.list(serviceId).then(setRows).finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (row: ServiceStudyUnit) => { setEditing(row); setFormOpen(true); };

  const handleSave = async (input: ServiceStudyUnitInput) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await businessProfileDetailApi.serviceStudyUnits.update(serviceId, editing.id, input);
        setRows((r) => r.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Study unit updated");
      } else {
        const created = await businessProfileDetailApi.serviceStudyUnits.create(serviceId, input);
        setRows((r) => [...r, created]);
        toast.success("Study unit added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save study unit", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await businessProfileDetailApi.serviceStudyUnits.remove(serviceId, id);
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Study unit removed");
    } catch (e) {
      toast.error("Couldn't remove study unit", { description: (e as Error).message });
    }
  };

  const totals = (type: ServiceStudyUnit["unit_type"]) => rows.filter((r) => r.unit_type === type).reduce((sum, r) => sum + (r.credit_points ?? 0), 0);
  const compulsory = totals("compulsory");
  const elective = totals("elective");
  const total = compulsory + elective;

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (filter === "all" || r.unit_type === filter) && (!q || `${r.unit_code ?? ""} ${r.unit_name}`.toLowerCase().includes(q)),
  );

  const summary = (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border bg-card px-5 py-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Total credits</p>
        <p className="text-[26px] font-bold leading-tight tracking-tight"><CountUp value={total} /></p>
      </div>
      {total > 0 && (
        <div className="min-w-[220px] max-w-[440px] flex-1">
          <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
            {compulsory > 0 && <i className="animate-fill-x h-full bg-primary" style={{ flex: compulsory, "--fill-delay": "200ms" } as React.CSSProperties} />}
            {elective > 0 && <i className="animate-fill-x h-full bg-violet-500" style={{ flex: elective, "--fill-delay": "350ms" } as React.CSSProperties} />}
          </div>
          <div className="mt-1.5 flex gap-3.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-primary" />Compulsory {compulsory}</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-violet-500" />Elective {elective}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <TabSection
        icon={BookOpen}
        title="Study units"
        count={rows.length}
        addLabel="Add unit"
        onAdd={openAdd}
        loading={loading}
        emptyTitle="No study units yet"
        emptyHint="Add the compulsory and elective units students take in this course."
        summary={summary}
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search units by code or name…"
              aria-label="Search units"
              className="h-9 border-transparent bg-muted/60 pl-9 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-primary/20"
            />
          </label>
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} aria-label="Filter units by type" />
        </div>
        <div className="flex flex-col gap-4">
          {visible.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm font-semibold">
              {q ? <>No units match &ldquo;{query.trim()}&rdquo;</> : `No ${filter} units yet`}
            </div>
          ) : (
            (["compulsory", "elective"] as const).map((type) => {
              const group = visible.filter((r) => r.unit_type === type);
              if (group.length === 0) return null;
              const credits = group.reduce((sum, r) => sum + (r.credit_points ?? 0), 0);
              return (
                <div key={type} className="stagger-in flex flex-col gap-2">
                  <h3 className="mt-1.5 flex justify-between text-xs font-semibold uppercase tracking-[.06em] text-muted-foreground">
                    <span>{UNIT_TYPE_LABELS[type]} · {group.length}</span>
                    <span>{credits} credits</span>
                  </h3>
                  {group.map((row) => (
                    <StudyUnitRow key={row.id} unit={row} query={query.trim()} onEdit={() => openEdit(row)} onDelete={() => handleDelete(row.id)} />
                  ))}
                </div>
              );
            })
          )}
        </div>
      </TabSection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-xl">
          <ServiceStudyUnitForm unit={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} />
        </DialogContent>
      </Dialog>
    </>
  );
}

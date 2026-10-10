"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Calendar, ChevronDown } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";
import { businessProfileDetailApi } from "../../../apis";
import { ServiceIntakeForm } from "./service-intake-form";
import { TabSection } from "./tab-section";
import { IntakeRow } from "./intake-row";
import { NextIntakeCard, type Countdown } from "./next-intake-card";
import type { TileParts } from "./intake-date-tile";
import type { ServiceIntake, ServiceIntakeInput } from "../../../apis/types";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(value: string) {
  const d = new Date(value);
  return { month: MONTH_ABBR[d.getMonth()], day: d.getDate(), year: d.getFullYear() };
}

/** The tile's date: a full date when there is one, else the month/year an extracted intake
 *  often only has, else null — never a placeholder that looks like a broken date. */
function tileParts(intake: ServiceIntake): TileParts | null {
  const ref = intake.start_date ?? intake.end_date;
  if (ref) {
    const p = dateParts(ref);
    return { top: p.month ?? "", main: String(p.day), bottom: String(p.year) };
  }
  if (intake.intake_month || intake.intake_year) {
    return { top: intake.intake_month ? MONTH_ABBR[intake.intake_month - 1] ?? "" : "", main: String(intake.intake_year ?? ""), bottom: "" };
  }
  return null;
}

/** null = no date at all, so it can't honestly be called upcoming or ended. */
function isEnded(intake: ServiceIntake): boolean | null {
  const ref = intake.end_date ?? intake.start_date;
  if (ref) return new Date(ref) < new Date();
  if (intake.intake_year) {
    const now = new Date();
    const month = intake.intake_month ?? 12;
    return intake.intake_year < now.getFullYear() || (intake.intake_year === now.getFullYear() && month < now.getMonth() + 1);
  }
  return null;
}

function dateBits(intake: ServiceIntake): string[] {
  return [
    intake.start_date && `Starts ${formatDate(intake.start_date)}`,
    intake.admission_deadline && `Apply by ${formatDate(intake.admission_deadline)}`,
    intake.end_date && `Ends ${formatDate(intake.end_date)}`,
  ].filter((b): b is string => Boolean(b));
}

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Best date to order by: the start date, else the month/year, else the end date. */
function sortKey(intake: ServiceIntake): number {
  if (intake.start_date) return new Date(intake.start_date).getTime();
  if (intake.intake_year) return new Date(intake.intake_year, (intake.intake_month ?? 1) - 1, 1).getTime();
  if (intake.end_date) return new Date(intake.end_date).getTime();
  return Number.POSITIVE_INFINITY;
}

/** Upcoming = starts today or later (soonest first); past = started before today (latest first).
 * Without a start date, fall back to `isEnded`'s month/year/end-date reading. */
function groupIntakes(intakes: ServiceIntake[]) {
  const today = startOfToday();
  const upcoming: ServiceIntake[] = [];
  const past: ServiceIntake[] = [];
  const undated: ServiceIntake[] = [];
  for (const intake of intakes) {
    const ended = intake.start_date ? new Date(intake.start_date) < today : isEnded(intake);
    if (ended === null) undated.push(intake);
    else (ended ? past : upcoming).push(intake);
  }
  upcoming.sort((a, b) => sortKey(a) - sortKey(b));
  past.sort((a, b) => sortKey(b) - sortKey(a));
  return { upcoming, past, undated };
}

function heroDateLine(intake: ServiceIntake): string {
  const bits = [intake.start_date && `Starts ${formatDate(intake.start_date)}`, intake.end_date && `Ends ${formatDate(intake.end_date)}`].filter(Boolean);
  if (bits.length > 0) return bits.join(" · ");
  const parts = tileParts(intake);
  return parts ? `Starts ${[parts.top, parts.main].filter(Boolean).join(" ")}` : "Dates to be confirmed";
}

/** Days left to apply, plus where today sits in the last 90 days before the deadline. */
function countdown(intake: ServiceIntake): Countdown | null {
  if (!intake.admission_deadline) return null;
  const deadline = new Date(intake.admission_deadline);
  const today = startOfToday();
  const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / DAY_MS);
  const windowStart = new Date(deadline.getTime() - WINDOW_DAYS * DAY_MS);
  const elapsed = (Date.now() - windowStart.getTime()) / (WINDOW_DAYS * DAY_MS);
  return {
    deadlineLabel: formatDate(intake.admission_deadline),
    daysLeft: daysLeft >= 0 ? daysLeft : null,
    windowPct: Math.max(0, Math.min(1, elapsed)) * 100,
    windowStartLabel: `${WINDOW_DAYS} days before · ${formatDate(windowStart.toISOString())}`,
  };
}

function formatDate(value: string) {
  const d = new Date(value);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** `allowMonth` — institution intakes store month-only dates; a business service's are `date` columns. */
export function IntakesTab({ serviceId, allowMonth = false }: Readonly<{ serviceId: string; allowMonth?: boolean }>) {
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceIntake | null>(null);
  const [saving, setSaving] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessProfileDetailApi.serviceIntakes.list(serviceId).then(setIntakes).finally(() => setLoading(false));
  }, [serviceId]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (intake: ServiceIntake) => { setEditing(intake); setFormOpen(true); };

  const handleSave = async (input: ServiceIntakeInput) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await businessProfileDetailApi.serviceIntakes.update(serviceId, editing.id, input);
        setIntakes((i) => i.map((x) => (x.id === editing.id ? updated : x)));
        toast.success("Intake updated");
      } else {
        const created = await businessProfileDetailApi.serviceIntakes.create(serviceId, input);
        setIntakes((i) => [...i, created]);
        toast.success("Intake added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Couldn't save intake", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (intakeId: number) => {
    try {
      await businessProfileDetailApi.serviceIntakes.remove(serviceId, intakeId);
      setIntakes((i) => i.filter((x) => x.id !== intakeId));
      toast.success("Intake removed");
    } catch (e) {
      toast.error("Couldn't remove intake", { description: (e as Error).message });
    }
  };

  const { upcoming, past, undated } = groupIntakes(intakes);
  const [next, ...laterUpcoming] = upcoming;
  const rowProps = (intake: ServiceIntake) => ({
    name: intake.intake_name || "Untitled intake",
    parts: tileParts(intake),
    dateBits: dateBits(intake),
    onEdit: () => openEdit(intake),
    onDelete: () => handleDelete(intake.id),
  });
  const summary = [`${upcoming.length} upcoming`, `${past.length} past`, undated.length > 0 && `${undated.length} undated`].filter(Boolean).join(" · ");

  return (
    <>
      <TabSection
        icon={Calendar}
        title="Intakes"
        count={intakes.length}
        addLabel="Add intake"
        onAdd={openAdd}
        loading={loading}
        emptyTitle="No intakes yet"
        emptyHint="Add the start dates students can join, with their application deadlines."
        summary={<p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{summary}</p>}
      >
        {next && (
          <NextIntakeCard
            name={next.intake_name || "Untitled intake"}
            parts={tileParts(next)}
            dateLine={heroDateLine(next)}
            countdown={countdown(next)}
            onEdit={() => openEdit(next)}
            onDelete={() => handleDelete(next.id)}
          />
        )}
        {laterUpcoming.map((intake) => <IntakeRow key={intake.id} status="upcoming" {...rowProps(intake)} />)}
        {undated.map((intake) => <IntakeRow key={intake.id} status="undated" {...rowProps(intake)} />)}
        {past.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setPastOpen((o) => !o)}
              aria-expanded={pastOpen}
              className="flex items-center gap-1.5 rounded-md py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", pastOpen && "rotate-180")} />
              Past intakes ({past.length})
            </button>
            <Reveal open={pastOpen} className="flex flex-col gap-2 pt-2">
              {past.map((intake) => <IntakeRow key={intake.id} status="past" {...rowProps(intake)} />)}
            </Reveal>
          </div>
        )}
      </TabSection>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
          <ServiceIntakeForm intake={editing ?? undefined} saving={saving} onCancel={() => setFormOpen(false)} onSave={handleSave} allowMonth={allowMonth} />
        </DialogContent>
      </Dialog>
    </>
  );
}

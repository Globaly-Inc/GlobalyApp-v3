"use client";

import { useEffect, useRef, useState } from "react";
import { Award, BookOpen, CalendarDays, CheckCircle2, Circle, DollarSign, Globe2, Pencil, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { businessesApi } from "../../apis";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchLookup } from "@/app/admin/platform/categories/store/categories-slice";
import { ServiceMediaUploader } from "./service-media-uploader";
import type { ServiceEligibility, ServiceFee, ServiceIntake, ServiceMediaFile, ServiceStudyUnit } from "../../apis/types";

type Kind = "business" | "institution";

export function PublicBadge() {
  return (
    <Badge variant="secondary" className="gap-1 text-[11px]">
      <Globe2 className="h-3 w-3" />
      Public
    </Badge>
  );
}

/** Matches V1's plain-div card header (BusinessServiceEditor.tsx): icon h-5 w-5 text-primary,
 * h2 font-semibold text-sm, border-b, px-5 py-4 — shadcn's CardHeader/CardTitle read visually
 * smaller/lighter, so summary cards use this instead for same-to-same parity. */
function SummaryCardHeader({
  icon: Icon, title, count, action,
}: Readonly<{ icon: React.ComponentType<{ className?: string }>; title: string; count?: number; action?: React.ReactNode }>) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && <Badge variant="secondary" className="text-xs">{count}</Badge>}
        <PublicBadge />
      </div>
      {action}
    </div>
  );
}

function ManageButton({ hasData, onClick }: Readonly<{ hasData: boolean; onClick: () => void }>) {
  return (
    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={onClick}>
      {hasData ? "Manage" : "Add"}
    </Button>
  );
}

function useServiceSummaryData(kind: Kind, orgId: number, serviceId: string, refreshKey: string | number) {
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [eligibility, setEligibility] = useState<ServiceEligibility[]>([]);
  const [studyUnits, setStudyUnits] = useState<ServiceStudyUnit[]>([]);
  const [accreditations, setAccreditations] = useState<Accreditation[]>([]);
  const [loading, setLoading] = useState(true);

  // Keyed by refreshKey (the parent's current tab) rather than a mount-once ref: this component
  // renders in the sidebar for the whole time the service is being edited, so it never remounts
  // when the admin adds a fee/intake/etc. on another tab — only re-running this fetch when the
  // caller's key changes (e.g. navigating back to the "summary" tab) picks up those additions.
  const fetchedForRef = useRef<string | number | null>(null);
  useEffect(() => {
    if (fetchedForRef.current === refreshKey) return;
    fetchedForRef.current = refreshKey;
    const isBiz = kind === "business";
    Promise.all([
      (isBiz ? businessesApi.getServiceFees : businessesApi.getInstitutionServiceFees)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceIntakes : businessesApi.getInstitutionServiceIntakes)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceEligibility : businessesApi.getInstitutionServiceEligibility)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceStudyUnits : businessesApi.getInstitutionServiceStudyUnits)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceAccreditations : businessesApi.getInstitutionServiceAccreditations)(orgId, serviceId),
    ]).then(async ([f, i, e, u, a]) => {
      setFees(f); setIntakes(i); setEligibility(e); setStudyUnits(u);
      if (a.length > 0) {
        const catalog = await categoriesApi.getAccreditations({ limit: 100 });
        const byId = new Map(catalog.data.map((c) => [c.id, c]));
        setAccreditations(a.map((row) => byId.get(row.accreditation_id)).filter((x): x is Accreditation => Boolean(x)));
      }
    }).finally(() => setLoading(false));
  }, [kind, orgId, serviceId, refreshKey]);

  return { fees, intakes, eligibility, studyUnits, accreditations, loading };
}

export function ServiceSummaryBodyExtras({
  kind, orgId, serviceId, isCourse, onNavigateTab,
}: Readonly<{ kind: Kind; orgId: number; serviceId: string; isCourse: boolean; onNavigateTab: (tab: "study-units" | "accreditations" | "eligibility") => void }>) {
  const dispatch = useAppDispatch();
  const degreeLevels = useAppSelector((s) => s.platformCategories.degreeLevels.data);
  // This card only exists while tab === "summary" (its parent unmounts it otherwise), so a plain
  // mount-once fetch is enough — it's naturally refreshed every time the admin returns here.
  const { eligibility, studyUnits, accreditations, loading } = useServiceSummaryData(kind, orgId, serviceId, "summary");
  const [media, setMedia] = useState<ServiceMediaFile[]>([]);
  const [editingMedia, setEditingMedia] = useState(false);

  const mediaFetchedRef = useRef(false);
  useEffect(() => {
    if (mediaFetchedRef.current) return;
    mediaFetchedRef.current = true;
    const load = kind === "business" ? businessesApi.getServiceMedia : businessesApi.getInstitutionServiceMedia;
    load(orgId, serviceId).then((res) => setMedia(res.files));
  }, [kind, orgId, serviceId]);

  const handleUpload = async (file: File) => {
    const upload = kind === "business" ? businessesApi.uploadServiceMedia : businessesApi.uploadInstitutionServiceMedia;
    const created = await upload(orgId, serviceId, file);
    setMedia((m) => [...m, created]);
  };

  const handleDeleteMedia = async (fileId: number) => {
    const del = kind === "business" ? businessesApi.deleteServiceMedia : businessesApi.deleteInstitutionServiceMedia;
    await del(orgId, serviceId, fileId);
    setMedia((m) => m.filter((f) => f.id !== fileId));
  };

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (degreeLevels.length === 0) dispatch(fetchLookup({ kind: "degree-levels" }));
  }, [dispatch, degreeLevels.length]);

  if (loading) return null;

  return (
    <>
      {isCourse && (
      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader icon={BookOpen} title="Study units" count={studyUnits.length} action={<ManageButton hasData={studyUnits.length > 0} onClick={() => onNavigateTab("study-units")} />} />
        <CardContent className="p-4">
          {studyUnits.length === 0 ? (
            <p className="py-2 text-center text-sm italic text-muted-foreground">No study units assigned yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {studyUnits.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {u.unit_code && <span className="font-mono text-[11px] font-semibold text-primary">{u.unit_code}</span>}
                      <p className="truncate text-xs font-semibold">{u.unit_name}</p>
                    </div>
                    <Badge variant={u.unit_type === "elective" ? "secondary" : "default"} className="mt-0.5 h-4 px-1.5 py-0 text-[9px]">
                      {u.unit_type === "elective" ? "Elective" : "Compulsory"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {isCourse && (
      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader icon={Award} title="Accreditations" count={accreditations.length} action={<ManageButton hasData={accreditations.length > 0} onClick={() => onNavigateTab("accreditations")} />} />
        <CardContent className="p-4">
          {accreditations.length === 0 ? (
            <p className="py-2 text-center text-sm italic text-muted-foreground">No accreditations linked yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {accreditations.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Award className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{a.name}</p>
                    {a.issuing_organization_name && <p className="truncate text-[11px] text-muted-foreground">{a.issuing_organization_name}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {isCourse && (
      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader icon={ShieldCheck} title="Eligibility" count={eligibility.length} action={<ManageButton hasData={eligibility.length > 0} onClick={() => onNavigateTab("eligibility")} />} />
        <CardContent className="p-4">
          {eligibility.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No eligibility requirements configured yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {eligibility.map((row) => (
                <div key={row.id} className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
                  <Badge variant="secondary" className="text-xs capitalize">{row.applicable_to}</Badge>
                  {(row.degree_level_id || (row.score_type && row.min_score)) && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Academic</p>
                      {row.degree_level_id && (
                        <p className="text-xs">Min. degree: <span className="font-medium">{degreeLevels.find((d) => d.id === row.degree_level_id)?.name ?? "—"}</span></p>
                      )}
                    </div>
                  )}
                  {row.language_tests.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Language tests</p>
                      <div className="flex flex-wrap gap-1.5">
                        {row.language_tests.map((t, i) => (
                          <Badge key={`${t.test_type_name}-${i}`} variant="outline">{t.test_type_name} ≥ {t.overall_score}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader
          icon={ShieldCheck}
          title="Media"
          count={media.length}
          action={
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingMedia((v) => !v)} aria-label="Edit media">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <CardContent className="p-5">
          <ServiceMediaUploader files={media} onUpload={handleUpload} onDelete={handleDeleteMedia} showDropzone={editingMedia} />
        </CardContent>
      </Card>
    </>
  );
}

export function ServiceSummarySidebarExtras({
  kind, orgId, serviceId, name, hasCategory, description, isCourse, tab, onNavigateTab,
}: Readonly<{
  kind: Kind; orgId: number; serviceId: string; name: string; hasCategory: boolean; description: string; isCourse: boolean;
  tab: string;
  onNavigateTab: (tab: "fees" | "intakes" | "eligibility") => void;
}>) {
  // Unlike the body extras above, this sidebar renders for every tab (it's not gated on
  // tab === "summary"), so it never unmounts while the admin adds a fee/intake elsewhere —
  // re-keying the fetch on `tab` picks those changes up whenever the tab changes, instead of only
  // on a full page reload.
  const { fees, intakes, eligibility, loading } = useServiceSummaryData(kind, orgId, serviceId, tab);
  if (loading) return null;

  const checklist = [
    { label: "Name & Category", done: name.trim().length > 0 && hasCategory },
    { label: "Description", done: description.trim().length > 0 },
    { label: "Fees", done: fees.length > 0 },
    ...(isCourse ? [
      { label: "Intakes", done: intakes.length > 0 },
      { label: "Eligibility", done: eligibility.length > 0 },
    ] : []),
  ];
  const doneCount = checklist.filter((s) => s.done).length;
  const remaining = checklist.filter((s) => !s.done);
  const pct = Math.round((doneCount / checklist.length) * 100);

  return (
    <>
      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader icon={DollarSign} title={isCourse ? "Course fees" : "Service fees"} action={<ManageButton hasData={fees.length > 0} onClick={() => onNavigateTab("fees")} />} />
        <CardContent className="p-5">
          {fees.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No fees configured yet.</p>
          ) : (
            <div className="space-y-3">
              {fees.map((fee) => {
                const first = fee.installments[0];
                const firstTotal = first?.lines.reduce((sum, l) => sum + l.amount, 0) ?? 0;
                return (
                  <div key={fee.id} className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
                    <Badge variant="secondary" className="text-xs capitalize">{fee.student_type}</Badge>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Total{fee.installments.length > 0 ? ` (${fee.installments.length} instalment${fee.installments.length !== 1 ? "s" : ""})` : ""}
                    </p>
                    <p className="text-lg font-bold">{fee.currency} {Number(fee.total_amount).toLocaleString()}</p>
                    {first && (
                      <p className="text-xs font-medium">{first.label || "1st instalment"}: {fee.currency} {firstTotal.toLocaleString()}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isCourse && (
      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader icon={CalendarDays} title="Intakes" action={<ManageButton hasData={intakes.length > 0} onClick={() => onNavigateTab("intakes")} />} />
        <CardContent className="space-y-3 p-5">
          {intakes.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No intakes configured yet.</p>
          ) : (
            intakes.map((intake) => {
              const startDate = intake.start_date ? new Date(intake.start_date) : null;
              return (
                <Card key={intake.id} className="overflow-hidden">
                  <CardContent className="flex p-0">
                    <div className="flex min-w-[60px] flex-col items-center justify-center border-r bg-primary/10 px-3 py-3 text-primary">
                      {startDate ? (
                        <>
                          <span className="text-[10px] font-bold uppercase tracking-wider">{startDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
                          <span className="mt-0.5 text-xl font-black leading-none">{startDate.getDate()}</span>
                          <span className="mt-0.5 text-[10px] font-medium">{startDate.getFullYear()}</span>
                        </>
                      ) : (
                        <CalendarDays className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
                      <p className="truncate text-sm font-semibold">{intake.intake_name || "Unnamed intake"}</p>
                      {intake.admission_deadline && (
                        <p className="text-xs text-muted-foreground">
                          Deadline {new Date(intake.admission_deadline).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>
      )}

      {doneCount < checklist.length && (
        <Card className="gap-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <h2 className="shrink-0 text-sm font-semibold">Service profile setup</h2>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Progress value={pct} className="h-1.5 flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground">{doneCount}/{checklist.length}</span>
            </div>
          </div>
          <CardContent className="space-y-2 p-5">
            {remaining.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

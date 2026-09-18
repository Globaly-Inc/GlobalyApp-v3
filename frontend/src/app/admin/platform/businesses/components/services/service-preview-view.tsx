"use client";

// Read-only "what a visitor would see" preview of a business/institution service — opened from
// the "Preview" button on the editor. There's no public page for this entity yet (only courses
// and personal "earn" services have one), so this reuses the same admin-authenticated GET
// endpoints the editor already calls rather than standing up a new public route + backend
// endpoint just to view your own unpublished draft.

import { useEffect, useState } from "react";
import { ArrowLeft, Award, BookOpen, CalendarDays, DollarSign, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { businessesApi } from "../../apis";
import type {
  BusinessDetail, BusinessService, InstitutionDetail, ServiceAccreditation, ServiceEligibility,
  ServiceFee, ServiceIntake, ServiceStudyOption, ServiceStudyUnit,
} from "../../apis/types";

type Kind = "business" | "institution";
type OrgDetail = Pick<BusinessDetail | InstitutionDetail, "business_name" | "logo_url" | "cover_url">;

function SectionHeader({ icon: Icon, title, count }: Readonly<{ icon: React.ComponentType<{ className?: string }>; title: string; count: number }>) {
  return (
    <div className="flex items-center gap-2 border-b px-5 py-4">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="text-sm font-semibold">{title}</h2>
      <Badge variant="secondary" className="text-xs">{count}</Badge>
    </div>
  );
}

export function ServicePreviewView({
  kind, orgId, serviceId, embedded = false,
}: Readonly<{ kind: Kind; orgId: number; serviceId: string; embedded?: boolean }>) {
  const router = useRouter();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [service, setService] = useState<BusinessService | null>(null);
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [intakes, setIntakes] = useState<ServiceIntake[]>([]);
  const [eligibility, setEligibility] = useState<ServiceEligibility[]>([]);
  const [studyOptions, setStudyOptions] = useState<ServiceStudyOption[]>([]);
  const [studyUnits, setStudyUnits] = useState<ServiceStudyUnit[]>([]);
  const [accreditationNames, setAccreditationNames] = useState<Record<number, string>>({});
  const [accreditations, setAccreditations] = useState<ServiceAccreditation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isBiz = kind === "business";
    Promise.all([
      isBiz ? businessesApi.getBusinessDetail(orgId) : businessesApi.getInstitutionDetail(orgId),
      (isBiz ? businessesApi.getServices : businessesApi.getInstitutionServices)(orgId),
      (isBiz ? businessesApi.getServiceFees : businessesApi.getInstitutionServiceFees)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceIntakes : businessesApi.getInstitutionServiceIntakes)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceEligibility : businessesApi.getInstitutionServiceEligibility)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceStudyOptions : businessesApi.getInstitutionServiceStudyOptions)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceStudyUnits : businessesApi.getInstitutionServiceStudyUnits)(orgId, serviceId),
      (isBiz ? businessesApi.getServiceAccreditations : businessesApi.getInstitutionServiceAccreditations)(orgId, serviceId),
    ]).then(async ([orgDetail, services, f, i, e, so, su, acc]) => {
      setOrg(orgDetail);
      setService(services.find((s) => s.id === serviceId) ?? null);
      setFees(f); setIntakes(i); setEligibility(e); setStudyOptions(so); setStudyUnits(su); setAccreditations(acc);
      if (acc.length > 0) {
        const { categoriesApi } = await import("@/app/admin/platform/categories/apis");
        const catalog = await categoriesApi.getAccreditations({ limit: 100 });
        setAccreditationNames(Object.fromEntries(catalog.data.map((a) => [a.id, a.name])));
      }
    }).finally(() => setLoading(false));
  }, [kind, orgId, serviceId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!service) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Service not found.</p>;
  }

  const isCourse = service.category_name === "Academic Courses";

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-3xl space-y-4 pb-20"}>
      {!embedded && (
        <Button variant="ghost" className="h-10 cursor-pointer gap-1 px-1 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back to editor
        </Button>
      )}

      <Card className="overflow-hidden">
        <div className="relative h-40 bg-gradient-to-br from-primary to-primary/60 sm:h-48">
          {org?.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <Avatar className="absolute -bottom-12 left-6 size-24 rounded-xl border-4 border-background bg-white shadow-lg">
            {org?.logo_url && <AvatarImage src={org.logo_url} alt={org.business_name} className="rounded-lg object-contain p-1" />}
            <AvatarFallback className="rounded-lg bg-primary text-2xl font-medium text-primary-foreground">
              {(org?.business_name ?? "B").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <CardContent className="ml-8 mb-8 flex flex-col gap-1.5 pt-16">
          {service.category_name && (
            <Badge variant="secondary" className="w-fit rounded-full border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary">
              {service.category_name}
            </Badge>
          )}
          <h1 className="text-xl font-bold text-foreground">{service.name}</h1>
          <p className="text-sm text-muted-foreground">{org?.business_name ?? "—"}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="gap-0 overflow-hidden">
            <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Description</h2></div>
            <CardContent className="p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{service.description || "No description available."}</p>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden">
            <SectionHeader icon={BookOpen} title="Study units" count={studyUnits.length} />
            <CardContent className="space-y-2 p-5">
              {studyUnits.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No study units assigned yet.</p>
              ) : studyUnits.map((u) => (
                <div key={u.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  {u.unit_code && <span className="font-mono text-xs font-semibold text-primary">{u.unit_code}</span>}
                  <span>{u.unit_name}</span>
                  <Badge variant={u.unit_type === "elective" ? "secondary" : "default"} className="text-[10px]">{u.unit_type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden">
            <SectionHeader icon={Award} title="Accreditations" count={accreditations.length} />
            <CardContent className="space-y-2 p-5">
              {accreditations.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No accreditations linked yet.</p>
              ) : accreditations.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium">
                  {accreditationNames[a.accreditation_id] ?? `Accreditation #${a.accreditation_id}`}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden">
            <SectionHeader icon={ShieldCheck} title="Eligibility" count={eligibility.length} />
            <CardContent className="space-y-2 p-5">
              {eligibility.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No eligibility requirements configured yet.</p>
              ) : eligibility.map((row) => (
                <div key={row.id} className="space-y-1.5 rounded-lg border p-3">
                  <Badge variant="secondary" className="text-xs capitalize">{row.applicable_to}</Badge>
                  {row.language_tests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {row.language_tests.map((t, idx) => (
                        <Badge key={`${t.test_type_name}-${idx}`} variant="outline">{t.test_type_name} ≥ {t.overall_score}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden">
            <SectionHeader icon={BookOpen} title="Study options" count={studyOptions.length} />
            <CardContent className="space-y-2 p-5">
              {studyOptions.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No study options configured yet.</p>
              ) : studyOptions.map((o) => (
                <div key={o.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <Badge className="capitalize">{o.study_mode.replace("_", " ")}</Badge>
                  <span className="capitalize">{o.study_load.replace("_", " ")}</span>
                  {o.duration_value && <span className="text-muted-foreground">· {o.duration_value} {o.duration_unit}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-0 overflow-hidden">
            <SectionHeader icon={DollarSign} title={isCourse ? "Course fees" : "Service fees"} count={fees.length} />
            <CardContent className="space-y-3 p-5">
              {fees.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No fees configured yet.</p>
              ) : fees.map((fee) => (
                <div key={fee.id} className="space-y-1 rounded-lg border p-3">
                  <Badge variant="secondary" className="text-xs capitalize">{fee.student_type}</Badge>
                  <p className="text-lg font-bold">{fee.currency} {Number(fee.total_amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{fee.period_type}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden">
            <SectionHeader icon={CalendarDays} title="Intakes" count={intakes.length} />
            <CardContent className="space-y-2 p-5">
              {intakes.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No intakes configured yet.</p>
              ) : intakes.map((i) => (
                <div key={i.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{i.intake_name || "Unnamed intake"}</p>
                  {i.start_date && <p className="text-xs text-muted-foreground">Starts {i.start_date}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

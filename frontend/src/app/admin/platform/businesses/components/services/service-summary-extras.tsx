"use client";

import { useEffect, useRef, useState } from "react";
import { Award, BookOpen, Pencil, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { businessesApi } from "../../apis";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchLookup } from "@/app/admin/platform/categories/store/categories-slice";
import { ServiceMediaUploader } from "./service-media-uploader";
import { ManageButton, SummaryCardHeader } from "./summary-card-header";
import { useServiceSummaryData, type Kind } from "./use-service-summary-data";
import type { ServiceMediaFile } from "../../apis/types";

export { PublicBadge } from "./summary-card-header";
export { ServiceSummarySidebarExtras } from "./service-summary-sidebar-extras";

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
                      {u.unit_code && <span className="font-mono text-xs font-semibold text-primary">{u.unit_code}</span>}
                      <p className="truncate text-xs font-semibold">{u.unit_name}</p>
                    </div>
                    <Badge variant={u.unit_type === "elective" ? "secondary" : "default"} className="mt-0.5 h-5 px-1.5 py-0 text-xs">
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
                    {a.issuing_organization_name && <p className="truncate text-xs text-muted-foreground">{a.issuing_organization_name}</p>}
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
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Academic</p>
                      {row.degree_level_id && (
                        <p className="text-xs">Min. degree: <span className="font-medium">{degreeLevels.find((d) => d.id === row.degree_level_id)?.name ?? "—"}</span></p>
                      )}
                    </div>
                  )}
                  {row.language_tests.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Language tests</p>
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

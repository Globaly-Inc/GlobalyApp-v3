"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Building2, ExternalLink, Globe, Loader2, Mail, MapPin, Phone, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { VERIFICATION_DOT } from "@/app/admin/data/all-extractions/const";
import { businessProfileDetailApi } from "../../apis";
import type { PartnerInstitutionCourse, PartnerInstitutionDetail } from "../../apis/types";

const PAGE_SIZE = 10;

function feeLabel(total: number | null, currency: string | null) {
  if (total == null) return null;
  return `${currency ?? ""} ${total.toLocaleString()}`.trim();
}

// Read-only view of a partner institution — email/detail plus its course catalogue, gated
// server-side on the partnership itself (see businesses.service.ts's getPartnerInstitutionDetail).
export function ViewInstitutionDrawer({
  open,
  onOpenChange,
  institutionId,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; institutionId: number | null }>) {
  const [detail, setDetail] = useState<PartnerInstitutionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [courses, setCourses] = useState<PartnerInstitutionCourse[]>([]);
  const [coursesTotal, setCoursesTotal] = useState(0);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open || !institutionId) return;
    setDetail(null);
    setSearch("");
    setDetailLoading(true);
    businessProfileDetailApi.getPartnerInstitutionDetail(institutionId).then(setDetail).finally(() => setDetailLoading(false));
  }, [open, institutionId]);

  useEffect(() => {
    if (!open || !institutionId) return;
    setPage(1);
    setCoursesLoading(true);
    const timer = setTimeout(() => {
      businessProfileDetailApi
        .getPartnerInstitutionCourses(institutionId, { search: search || undefined, page: 1, limit: PAGE_SIZE })
        .then((res) => { setCourses(res.data); setCoursesTotal(res.total); })
        .finally(() => setCoursesLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [open, institutionId, search]);

  const handlePageChange = (p: number) => {
    if (!institutionId) return;
    setPage(p);
    setCoursesLoading(true);
    businessProfileDetailApi
      .getPartnerInstitutionCourses(institutionId, { search: search || undefined, page: p, limit: PAGE_SIZE })
      .then((res) => { setCourses(res.data); setCoursesTotal(res.total); })
      .finally(() => setCoursesLoading(false));
  };

  let courseList: React.ReactNode;
  if (coursesLoading) {
    courseList = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (courses.length === 0) {
    courseList = (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
        <BookOpen className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">No courses yet</p>
      </div>
    );
  } else {
    courseList = (
      <div className="space-y-2">
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/course/${c.slug}`}
            target="_blank"
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <span
              className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", VERIFICATION_DOT[c.verification_status ?? "unverified"] ?? "bg-muted-foreground/30")}
            />
            <div className="min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{c.name}</span>
              <p className="truncate text-xs text-muted-foreground">
                {[c.degree_level, c.subject_area, c.study_mode, feeLabel(c.domestic_fee_total, c.domestic_currency)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl py-5">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> {detail?.institution_name ?? "Institution"}
          </SheetTitle>
          <SheetDescription>Partner institution detail and course catalogue.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
          {detailLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          {!detailLoading && detail && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              {detail.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> <span className="text-foreground">{detail.email}</span>
                </div>
              )}
              {detail.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> <span className="text-foreground">{detail.phone}</span>
                </div>
              )}
              {detail.website && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <a href={detail.website} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
                    {detail.website}
                  </a>
                </div>
              )}
              {(detail.city || detail.state || detail.address) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="text-foreground">{[detail.address, detail.city, detail.state].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {detail.description && <p className="pt-1 text-xs text-muted-foreground">{detail.description}</p>}
            </div>
          )}

          <div>
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Courses</span>
              <Badge variant="secondary">{coursesTotal}</Badge>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 pl-9" placeholder="Search courses..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {courseList}
            {coursesTotal > 0 && <Pagination page={page} total={coursesTotal} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

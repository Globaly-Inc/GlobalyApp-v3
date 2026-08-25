"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchEnquiries } from "../store/enquiries-slice";
import { REQUIRED_COMPLETION, type StatusFilterKey } from "../const";
import { applyStatusFilter, filterCounts } from "../utils";
import { EnquiriesEmptyState } from "./enquiries-empty-state";
import { EnquiryCard, EnquiryCardSkeleton } from "./enquiry-card";
import { EnquiryFilters } from "./enquiry-filters";
import { NewEnquiryDialog } from "./new-enquiry-dialog";
import { ProfileGateCard } from "./profile-gate-card";

export function EnquiriesView() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.enquiries);

  // The shell already loads the full profile, so the gate needs no extra fetch.
  // Percentage is the backend-computed figure carried on the profile — the same one that decides
  // referral qualification, so no screen can disagree with the server.
  const { profile, status: profileStatus } = useAppSelector((s) => s.profile);
  const completion = profile?.completion?.percentage ?? null;
  const profileLoaded = profileStatus !== "loading" && !!profile;
  // Percentage only — same rule POST /enquiries enforces, so the UI never lets
  // through something the server would 403 (and never blocks what it would accept).
  const canEnquire = profileLoaded && completion !== null && completion >= REQUIRED_COMPLETION;

  // Arriving from the course search (/search?tab=courses) carries ?course_id=, so open on mount in
  // that case — otherwise the prefilled dialog would never be shown. Derived
  // initial state; the repo lints against set-state-in-effect.
  //
  // Frozen at mount: the effect below strips the param from the URL, and the
  // dialog must keep its prefill through that change.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [initialCourseId] = useState(() => searchParams.get("course_id"));
  const [dialogOpen, setDialogOpen] = useState(!!initialCourseId);
  // Bumped on every manual open so the dialog remounts with a clean form. Opening
  // via setDialogOpen alone doesn't fire Dialog's onOpenChange, so the dialog
  // can't reset itself — and the query param lingers in the URL, which would
  // otherwise keep re-prefilling the same course on every later open.
  const [dialogSeq, setDialogSeq] = useState(0);
  const openBlankDialog = () => {
    setDialogSeq((n) => n + 1);
    setDialogOpen(true);
  };

  const [filter, setFilter] = useState<StatusFilterKey>("all");

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEnquiries());
  }, [dispatch]);

  // Consume the deep-link param once it has been used. Left in the URL, a reload
  // would reopen the dialog prefilled with the same course — and sharing or
  // bookmarking the page would carry that course along with it.
  useEffect(() => {
    if (initialCourseId) router.replace("/personal/enquiries", { scroll: false });
  }, [initialCourseId, router]);

  const counts = useMemo(() => filterCounts(items), [items]);
  const visible = useMemo(() => applyStatusFilter(items, filter), [items, filter]);

  // ponytail: "idle" means both "not fetched yet" and "fetched, came back empty", so the
  // empty state paints for the one frame before the mount effect runs. Telling those
  // apart needs a `listLoaded` flag on the slice — add it if the flash ever gets noticed.
  const loading = status === "loading" && items.length === 0;
  const failed = status === "failed" && items.length === 0;

  // Width and page padding come from PersonalShell (SHELL_WIDTH + <main>), same as
  // every other personal page — don't re-constrain or re-pad here.
  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Enquiries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track all your enquiries to institutions and agents.
          </p>
        </div>

        {/* Reserve the button's footprint while the profile decides whether it may
            appear, so the header doesn't jump once the gate resolves. */}
        {!profileLoaded ? (
          <Skeleton className="h-10 w-32 rounded-lg" />
        ) : (
          canEnquire && (
            <Button onClick={openBlankDialog}>
              <Plus className="size-4" aria-hidden />
              New Enquiry
            </Button>
          )
        )}
      </div>

      {profileLoaded && !canEnquire && <ProfileGateCard completion={completion} />}

      {items.length > 0 && <EnquiryFilters counts={counts} active={filter} onChange={setFilter} />}

      {loading && (
        <div className="space-y-3">
          <EnquiryCardSkeleton />
          <EnquiryCardSkeleton />
        </div>
      )}

      {/* A failed load used to render as an empty list, which reads as "you have no
          enquiries" — the one wrong thing to tell someone whose enquiries exist. */}
      {failed && (
        <Card className="items-center gap-2 border border-dashed border-destructive/40 px-6 py-12 text-center ring-0">
          <TriangleAlert className="size-6 text-destructive" aria-hidden />
          <p className="font-semibold text-foreground">Couldn&apos;t load your enquiries</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Something went wrong on our side. Your enquiries are safe — try again.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => dispatch(fetchEnquiries())}>
            <RotateCw className="size-3.5" aria-hidden />
            Try again
          </Button>
        </Card>
      )}

      {!loading && !failed && visible.length === 0 && (
        <EnquiriesEmptyState
          variant={items.length === 0 ? "no-enquiries" : "no-matches"}
          canEnquire={canEnquire}
          onNewEnquiry={openBlankDialog}
          onClearFilter={() => setFilter("all")}
        />
      )}

      {visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((enquiry) => (
            <EnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </div>
      )}

      <NewEnquiryDialog
        key={dialogSeq}
        open={dialogOpen && canEnquire}
        onOpenChange={setDialogOpen}
        // Only the first (deep-linked) open prefills; later opens start blank.
        prefillCourseId={dialogSeq === 0 ? initialCourseId : null}
      />
    </div>
  );
}

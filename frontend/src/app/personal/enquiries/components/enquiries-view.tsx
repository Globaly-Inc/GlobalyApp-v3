"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquareText, Plus, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchEnquiries } from "../store/enquiries-slice";
import { REQUIRED_COMPLETION, type StatusFilterKey } from "../const";
import { filterCounts, statusParam } from "../utils";
import { EnquiriesEmptyState } from "./enquiries-empty-state";
import { ENQUIRY_COLUMNS, EnquiryRow } from "./enquiry-row";
import { Pagination } from "@/components/ui/pagination";
import { ENQUIRIES_PAGE_SIZE } from "../const";
import { EnquiryFilters } from "./enquiry-filters";
import { EnquirySubmittedDialog } from "./enquiry-submitted-dialog";
import { NewEnquiryDialog } from "./new-enquiry-dialog";
import { ProfileGateCard } from "./profile-gate-card";

export function EnquiriesView() {
  const dispatch = useAppDispatch();
  const { items, status, total, countsByStatus } = useAppSelector((s) => s.enquiries);

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
  // The institution and business search cards deep-link their own listing: one preselects the
  // course picker's institution filter, the other names the business the enquiry is for.
  const [initialInstitutionJobId] = useState(() => searchParams.get("institution"));
  const [initialBusinessId] = useState(() => Number(searchParams.get("business_id")) || null);
  const [dialogOpen, setDialogOpen] = useState(!!initialCourseId || !!initialInstitutionJobId || !!initialBusinessId);
  // The consent the just-submitted enquiry carried, or null when nothing is awaiting its
  // disclaimer. One piece of state for both "show it" and "what to say".
  const [submittedConsent, setSubmittedConsent] = useState<boolean | null>(null);
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // One effect owns every fetch, so the three controls cannot race each other. Debounced because
  // the search box fires on every keystroke; the filter and page changes ride the same timer,
  // which costs them 250ms and saves a second code path.
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(fetchEnquiries({ page, search: search.trim() || undefined, status: statusParam(filter) }));
    }, 250);
    return () => clearTimeout(timer);
  }, [dispatch, page, search, filter]);

  // Changing what is being filtered invalidates the page number — page 4 of "Closed" is rarely
  // page 4 of "All", and staying there would show an empty list. Done in the handlers rather than
  // an effect: a setState in an effect body cascades an extra render, and here it would also fire
  // a fetch for the old page before the reset landed.
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeFilter = (next: StatusFilterKey) => {
    setFilter(next);
    setPage(1);
  };

  // Consume the deep-link param once it has been used. Left in the URL, a reload
  // would reopen the dialog prefilled with the same course — and sharing or
  // bookmarking the page would carry that course along with it.
  useEffect(() => {
    if (initialCourseId || initialInstitutionJobId || initialBusinessId) {
      router.replace("/personal/enquiries", { scroll: false });
    }
  }, [initialCourseId, initialInstitutionJobId, initialBusinessId, router]);

  const counts = useMemo(() => filterCounts(countsByStatus), [countsByStatus]);
  // The server already applied the status filter and the search, so the page is the page.
  const visible = items;

  // ponytail: "idle" means both "not fetched yet" and "fetched, came back empty", so the
  // empty state paints for the one frame before the mount effect runs. Telling those
  // apart needs a `listLoaded` flag on the slice — add it if the flash ever gets noticed.
  const loading = status === "loading" && items.length === 0;
  const failed = status === "failed" && items.length === 0;

  // Width and page padding come from PortalShell (width="default" in PersonalShell), same as
  // every other personal page — don't re-constrain or re-pad here.
  return (
    <PageBody>
      <PageHeader
        title={<><MessageSquareText /> My Enquiries</>}
        subtitle="Track all your enquiries to institutions and agents."
      >
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
      </PageHeader>

      {profileLoaded && !canEnquire && <ProfileGateCard completion={completion} />}

      {counts.all > 0 && <EnquiryFilters counts={counts} active={filter} onChange={changeFilter} />}

      <FilterBar>
        <SearchInput
          placeholder="Search by course or institution..."
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
        />
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {total} enquir{total === 1 ? "y" : "ies"}
        </span>
      </FilterBar>

      {loading && <ListSkeleton count={4} itemClassName="h-14" />}

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
          variant={counts.all === 0 && !search ? "no-enquiries" : "no-matches"}
          canEnquire={canEnquire}
          onNewEnquiry={openBlankDialog}
          onClearFilter={() => {
            changeFilter("all");
            changeSearch("");
          }}
        />
      )}

      {visible.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {ENQUIRY_COLUMNS.map((col) => (
                  <TableHead key={col.label} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((enquiry) => (
                <EnquiryRow key={enquiry.id} enquiry={enquiry} />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {/* `total > 0`, not `> ENQUIRIES_PAGE_SIZE` — every other paginated list in the app shows this
          whenever there are rows, because the "Showing 1–5 of 5" line is useful on a single page
          too. Gating on the page size hid it entirely for anyone with fewer rows than one page. */}
      {total > 0 && <Pagination page={page} total={total} limit={ENQUIRIES_PAGE_SIZE} onPageChange={setPage} />}

      <NewEnquiryDialog
        key={dialogSeq}
        open={dialogOpen && canEnquire}
        onOpenChange={setDialogOpen}
        // Only the first (deep-linked) open prefills; later opens start blank.
        prefillCourseId={dialogSeq === 0 ? initialCourseId : null}
        prefillInstitutionJobId={dialogSeq === 0 ? initialInstitutionJobId : null}
        prefillBusinessId={dialogSeq === 0 ? initialBusinessId : null}
        onSubmitted={setSubmittedConsent}
      />

      {/* Lives here rather than inside NewEnquiryDialog because that one closes on success —
          a dialog cannot show a follow-up to its own dismissal. null means "nothing submitted",
          which is why the consent is stored as boolean | null rather than a pair of flags. */}
      <EnquirySubmittedDialog
        open={submittedConsent !== null}
        onOpenChange={(next) => !next && setSubmittedConsent(null)}
        sharedContact={submittedConsent === true}
      />
    </PageBody>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Lock, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { computeCompletion } from "@/app/personal/profile-completion";
import { fetchEnquiries } from "../store/enquiries-slice";
import { REQUIRED_COMPLETION } from "../const";
import { EnquiryCard, EnquiryCardSkeleton } from "./enquiry-card";
import { NewEnquiryDialog } from "./new-enquiry-dialog";

export function EnquiriesView() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.enquiries);

  // The shell already loads the full profile, so the gate needs no extra fetch.
  // Percentage comes from the same computeCompletion() the profile page uses, so
  // the two screens can never disagree on the number.
  const { profile, qualifications, languageTests, status: profileStatus } = useAppSelector((s) => s.profile);
  const completion = profile ? computeCompletion(profile, qualifications, languageTests).percentage : null;
  const profileLoaded = profileStatus !== "loading" && !!profile;
  // Blocked on the percentage (v2 parity) OR the backend's own onboarding flag.
  //
  // This gate is UI-only: POST /enquiries enforces the 3-per-24h rate limit and
  // nothing else — no completion check, no onboarding check — so it is stricter
  // than the server rather than a mirror of it. It stays because v2 required 100%
  // and loosening it is a product decision, but nobody should read it as
  // preventing a 403 the server would otherwise return.
  const canEnquire =
    profileLoaded && completion !== null && completion >= REQUIRED_COMPLETION && profile!.onboarding_completed;

  // Arriving from /personal/courses carries ?course_id=..., so open on mount in
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

  useEffect(() => {
    dispatch(fetchEnquiries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consume the deep-link param once it has been used. Left in the URL, a reload
  // would reopen the dialog prefilled with the same course — and sharing or
  // bookmarking the page would carry that course along with it.
  useEffect(() => {
    if (initialCourseId) router.replace("/personal/enquiries", { scroll: false });
  }, [initialCourseId, router]);

  const loading = status === "loading" && items.length === 0;

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

        {canEnquire ? (
          <Button size="lg" className="gap-2" onClick={openBlankDialog}>
            <Plus className="size-4" aria-hidden />
            New Enquiry
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            <span>Complete your profile to send enquiries</span>
            {completion !== null && <span className="font-semibold text-primary">({completion}%)</span>}
          </div>
        )}
      </div>

      {profileLoaded && !canEnquire && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-amber-900 dark:text-amber-200">
            Your profile is <span className="font-semibold">{completion}%</span> complete. You need{" "}
            {REQUIRED_COMPLETION}% to send enquiries.{" "}
            <Link href="/personal/profile" className="font-semibold underline underline-offset-2">
              Complete now →
            </Link>
          </p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <EnquiryCardSkeleton />
          <EnquiryCardSkeleton />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <MessageSquare className="size-10 text-muted-foreground/40" aria-hidden />
          <p className="text-muted-foreground">No enquiries yet</p>
          <p className="text-sm text-muted-foreground/80">
            {canEnquire
              ? "Start one to hear back from institutions and agents."
              : "Complete your profile to start sending enquiries."}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((enquiry) => (
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

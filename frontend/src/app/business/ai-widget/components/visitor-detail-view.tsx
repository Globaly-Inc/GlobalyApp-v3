"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { geoApi, type Country } from "@/app/geo/apis";
import { relativeTime } from "@/components/feed/utils";
import { cn } from "@/lib/utils";
import { fetchVisitor, saveVisitor } from "../store/ai-widget-visitor-detail-slice";
import { VISITOR_STATUS_BADGE } from "../const";
import { visitorDisplayName, visitorInitials } from "../utils";
import { VisitorActivityCard, VisitorDetailCards, VisitorPreferenceCard } from "./visitor-detail-cards";
import { VisitorEditDialog } from "./visitor-edit-dialog";
import { VisitorRecordSections } from "./visitor-record-sections";
import { VisitorRecordDialogs, type RecordDeletion, type RecordEditor } from "./visitor-record-dialogs";
import { replaceEntry } from "../utils/visitor-records";
import type { VisitorPatch, VisitorProfileEntry, VisitorRecordSection, WidgetVisitor } from "../apis/types";

/**
 * Back to the list, which lives at `/business/profile/<id>?tab=visitors`.
 *
 * The id is not decoration. `/business/profile` with no id is a fallback page that resolves an
 * org itself and ignores `?tab` entirely, so a bare link looks like a redirect: you land on the
 * profile tab of whichever org it picked. `withBusinessId` in the sidebar consts exists for the
 * same reason — every profile link in the app carries the id.
 *
 * Both lists are searched by `orgId` BEFORE either falls back to its first entry. Taking
 * `businesses[0]` first, as the fallback page does, sends a user whose current context is an
 * institution to one of their businesses instead.
 */
function backHrefFor(user: { orgId: string | null; businesses: { id: number; org_id: string }[]; institutions: { id: number; org_id: string }[] } | null): string {
  const id = user
    ? (user.businesses.find((b) => b.org_id === user.orgId)?.id
      ?? user.institutions.find((i) => i.org_id === user.orgId)?.id
      ?? user.businesses[0]?.id
      ?? user.institutions[0]?.id)
    : undefined;
  return id == null ? "/business/profile?tab=visitors" : `/business/profile/${id}?tab=visitors`;
}

/**
 * The hero, mirroring the personal profile's — minus the cover and photo pickers, because a
 * widget visitor has neither. The gradient stands in for a cover image nobody can upload.
 */
function VisitorHero({ visitor }: Readonly<{ visitor: WidgetVisitor }>) {
  const badge = VISITOR_STATUS_BADGE[visitor.status];
  const anonymous = !visitor.name;

  return (
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
      <div className="h-32 bg-gradient-to-r from-primary to-primary/70 sm:h-40" />
      {/* Plain div, not CardContent: its padding comes from --card-spacing, which only <Card> sets. */}
      <div className="relative px-6 py-6">
        <div className="-mt-14 flex flex-col items-start gap-4 sm:flex-row">
          {/* Same box as the business profile logo, so a visitor's page reads as the same app. */}
          <div
            className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border-4 border-background bg-muted shadow-lg"
            aria-hidden
          >
            {anonymous ? (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <User className="h-10 w-10" />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary/70">
                <span className="text-3xl font-bold text-primary-foreground">{visitorInitials(visitor)}</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-2 sm:pt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={cn("text-xl font-bold", anonymous && "italic text-muted-foreground")}>
                {visitorDisplayName(visitor)}
              </h1>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {visitor.email ?? "No email shared"}
              {visitor.nationality ? ` · ${visitor.nationality}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              First seen {relativeTime(visitor.first_seen_at)} · Last active {relativeTime(visitor.last_activity_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One visitor, laid out like the personal profile page.
 *
 * Every field the profile shows that `ai_widget_visitors` has no column for — date of birth,
 * phone, address, profile completion, the public profile link — is simply absent rather than
 * rendered empty. What replaces the completion meter is the Conversation card: for a visitor,
 * "how far along are they" means how much they talked, not how much of a form they filled in.
 */
export function VisitorDetailView({ visitorId }: Readonly<{ visitorId: number }>) {
  const dispatch = useAppDispatch();
  const { visitor, status, savingStatus, error } = useAppSelector((s) => s.aiWidgetVisitorDetail);
  const { user } = useAuthState();
  const backHref = backHrefFor(user);
  const [countries, setCountries] = useState<Country[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editor, setEditor] = useState<RecordEditor>(null);
  const [deletion, setDeletion] = useState<RecordDeletion>(null);

  const fetchedRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedRef.current === visitorId) return;
    fetchedRef.current = visitorId;
    dispatch(fetchVisitor(visitorId));
  }, [dispatch, visitorId]);

  useEffect(() => {
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  const handleSave = async (patch: VisitorPatch) => {
    try {
      await dispatch(saveVisitor({ id: visitorId, patch })).unwrap();
      toast.success("Visitor updated");
      return true;
    } catch (e) {
      toast.error("Couldn't save changes", { description: (e as Error).message });
      return false;
    }
  };

  /**
   * Add, edit and delete are one request: the section's whole new list.
   *
   * Sending a patch rather than a per-entry endpoint is what keeps the server's rule simple —
   * it validates a list against the popup's fields and writes it, with no entry identity to
   * reconcile. Position is identity here, which is safe because the list this closes over is
   * the one the page is currently showing.
   */
  const saveSection = (section: VisitorRecordSection, next: VisitorProfileEntry[]) =>
    handleSave({ [section]: next });

  const recordActions = {
    onAdd: (section: VisitorRecordSection) => setEditor({ section, index: null }),
    onEdit: (section: VisitorRecordSection, index: number) => setEditor({ section, index }),
    onDelete: (section: VisitorRecordSection, index: number) => setDeletion({ section, index }),
  };

  const saveEntry = (section: VisitorRecordSection, index: number | null, entry: VisitorProfileEntry) =>
    saveSection(section, replaceEntry(visitor?.[section] ?? null, index, entry));

  const confirmDelete = () => {
    if (!deletion || !visitor) return;
    const next = (visitor[deletion.section] ?? []).filter((_, i) => i !== deletion.index);
    void saveSection(deletion.section, next);
    setDeletion(null);
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "failed" || !visitor) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium">{error ?? "This visitor could not be loaded."}</p>
        <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
          Back to Visitors &amp; Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Link href={backHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Visitors &amp; Leads
      </Link>

      <VisitorHero visitor={visitor} />

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="space-y-4 md:space-y-6 lg:col-span-2">
          <VisitorDetailCards visitor={visitor} onEdit={() => setEditOpen(true)} />
          <VisitorRecordSections visitor={visitor} actions={recordActions} />
        </div>
        <div className="space-y-4 md:space-y-6">
          <VisitorActivityCard visitor={visitor} />
          <VisitorPreferenceCard visitor={visitor} onEdit={() => setEditOpen(true)} />
        </div>
      </div>

      <VisitorEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        visitor={visitor}
        countries={countries}
        saving={savingStatus === "loading"}
        onSave={handleSave}
      />

      <VisitorRecordDialogs
        visitor={visitor}
        editor={editor}
        onEditorChange={setEditor}
        deletion={deletion}
        onDeletionChange={setDeletion}
        saving={savingStatus === "loading"}
        onSaveEntry={saveEntry}
        onConfirmDelete={confirmDelete}
      />
    </div>
  );
}

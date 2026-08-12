"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { Listing } from "../apis";
import {
  deleteListing,
  fetchListings,
  fetchPurchases,
  fetchReceived,
  fetchSummary,
  updateListing,
} from "../store/my-services-slice";
import { DeleteListingDialog, useDeleteTarget } from "./delete-listing-dialog";
import { EarningsStrip } from "./earnings-strip";
import { ListingCard } from "./listing-card";
import { OrderRow } from "./order-row";
import { EmptyState, SectionError } from "./section-error";
import { ServicesTabs } from "./services-tabs";

type Tab = "listings" | "purchases" | "received";

export function ServicesView() {
  const dispatch = useAppDispatch();
  const {
    summary,
    summaryStatus,
    summaryError,
    listings,
    listingsStatus,
    listingsError,
    purchases,
    purchasesStatus,
    purchasesError,
    received,
    receivedStatus,
    receivedError,
    saving,
  } = useAppSelector((state) => state.myServices);

  const [tab, setTab] = useState<Tab>("listings");
  const [busyListingId, setBusyListingId] = useState<number | null>(null);
  const deleteTarget = useDeleteTarget();

  // Four independent fetches. Each owns its own status field, so a failure in one region leaves the others
  // rendered rather than blanking the page.
  useEffect(() => {
    dispatch(fetchSummary());
    dispatch(fetchListings());
    dispatch(fetchPurchases());
    dispatch(fetchReceived());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePause = async (listing: Listing) => {
    setBusyListingId(listing.id);
    const next = !listing.is_active;
    const result = await dispatch(updateListing({ serviceId: listing.id, input: { is_active: next } }));
    setBusyListingId(null);

    if (updateListing.rejected.match(result)) {
      toast.error("Couldn't update the listing", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(next ? "Service activated" : "Service paused", {
      description: next ? "Buyers can find it again." : "It stays here for you, and existing orders finish normally.",
    });
  };

  const handleDelete = async (listing: Listing) => {
    setBusyListingId(listing.id);
    const result = await dispatch(deleteListing(listing.id));
    setBusyListingId(null);

    if (deleteListing.rejected.match(result)) {
      // The dialog stays open and the reason is shown, so a failed delete is never mistaken for a done one.
      // The server's 409 already names the open orders.
      toast.error("Couldn't delete the listing", { description: result.error.message ?? "Please try again." });
      return;
    }
    deleteTarget.close();
    toast.success("Listing deleted");
    // The listing's orders no longer count toward the strip.
    dispatch(fetchSummary());
  };

  const handlePauseFromDialog = async (listing: Listing) => {
    await handleTogglePause(listing);
    deleteTarget.close();
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 md:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Services</h1>
          <p className="text-sm text-muted-foreground">Manage your listings and orders</p>
        </div>
        <Button
          render={
            <Link href="/personal/services/new">
              <Plus />
              Create Service
            </Link>
          }
        />
      </header>

      <EarningsStrip
        summary={summary}
        status={summaryStatus}
        error={summaryError}
        onRetry={() => dispatch(fetchSummary())}
      />

      <ServicesTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "listings", label: "My Listings", count: listings.length },
          { value: "purchases", label: "My Purchases", count: purchases.length },
          { value: "received", label: "Received Orders", count: received.length },
        ]}
      />

      {tab === "listings" && (
        <Region
          status={listingsStatus}
          error={listingsError}
          onRetry={() => dispatch(fetchListings())}
          skeleton={
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[260px] rounded-lg" />
              ))}
            </div>
          }
          empty={
            listings.length === 0 && (
              <EmptyState
                title="You haven't created any service listings yet."
                hint="Offer airport pickups, tutoring or accommodation help — set your price and get paid."
                action={
                  <Button render={<Link href="/personal/services/new">Create Your First Service</Link>} />
                }
              />
            )
          }
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                busy={busyListingId === listing.id}
                onTogglePause={handleTogglePause}
                onDelete={deleteTarget.ask}
              />
            ))}
          </div>
        </Region>
      )}

      {tab === "purchases" && (
        <Region
          status={purchasesStatus}
          error={purchasesError}
          onRetry={() => dispatch(fetchPurchases())}
          skeleton={<RowSkeletons />}
          empty={
            purchases.length === 0 && (
              <EmptyState
                title="You haven't bought any services yet."
                // No public marketplace exists in this phase, so there is nowhere honest to send them yet.
                hint="Services other students offer will appear here once you buy one."
              />
            )
          }
        >
          <div className="space-y-2">
            {purchases.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        </Region>
      )}

      {tab === "received" && (
        <Region
          status={receivedStatus}
          error={receivedError}
          onRetry={() => dispatch(fetchReceived())}
          skeleton={<RowSkeletons />}
          empty={
            received.length === 0 && (
              <EmptyState
                title="No orders received yet."
                hint="Listings with a clear title, a cover image and a fair price get found first."
              />
            )
          }
        >
          <div className="space-y-2">
            {received.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        </Region>
      )}

      <DeleteListingDialog
        listing={deleteTarget.target}
        open={deleteTarget.open}
        busy={saving}
        onOpenChange={(open) => !open && deleteTarget.close()}
        onConfirm={handleDelete}
        onPause={handlePauseFromDialog}
      />
    </div>
  );
}

/** Loading → error → empty → content, in that order, for one tab. */
function Region({
  status,
  error,
  onRetry,
  skeleton,
  empty,
  children,
}: Readonly<{
  status: "idle" | "loading" | "failed";
  error: string | null;
  onRetry: () => void;
  skeleton: React.ReactNode;
  empty: React.ReactNode;
  children: React.ReactNode;
}>) {
  if (status === "loading") return <>{skeleton}</>;
  if (status === "failed") return <SectionError message={error} onRetry={onRetry} />;
  if (empty) return <>{empty}</>;
  return <>{children}</>;
}

function RowSkeletons() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[68px] rounded-lg" />
      ))}
    </div>
  );
}

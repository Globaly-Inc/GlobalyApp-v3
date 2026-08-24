"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearCreateError, createCampaign, deleteCampaign, fetchCampaigns, setCampaignStatus } from "../store/business-ads-slice";
import { CampaignCard } from "./campaign-card";
import { CreateCampaignDialog } from "./create-campaign-dialog";

export function AdsView() {
  const dispatch = useAppDispatch();
  const { items, status, error, creating, createError } = useAppSelector((s) => s.businessAds);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchCampaigns());
  }, [dispatch]);

  const [createOpen, setCreateOpen] = useState(false);
  const loading = status === "loading" && items.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Ads</h1>
          <p className="text-sm text-muted-foreground">Run promoted campaigns and track performance.</p>
        </div>
        <Button
          onClick={() => {
            dispatch(clearCreateError());
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New campaign
        </Button>
      </div>

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load ad campaigns"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchCampaigns())}>
            Try again
          </Button>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      )}

      {!loading && items.length === 0 && status !== "failed" && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No ad campaigns yet — create one to start promoting.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onStatusChange={(newStatus) => dispatch(setCampaignStatus({ campaignId: campaign.id, status: newStatus }))}
              onDelete={() => dispatch(deleteCampaign(campaign.id))}
            />
          ))}
        </div>
      )}

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        submitting={creating}
        error={createError}
        onConfirm={async (input) => {
          const result = await dispatch(createCampaign(input));
          if (createCampaign.fulfilled.match(result)) setCreateOpen(false);
        }}
      />
    </div>
  );
}

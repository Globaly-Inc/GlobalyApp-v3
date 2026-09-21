"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAppSelector } from "@/lib/hooks";
import { businessProfileDetailApi } from "../../apis";
import type { Branch } from "../../apis/types";

/**
 * Which branches also offer this service — V1's ServiceBranchSharing card on the editor sidebar.
 *
 * Sharing lives on the branch (`shared_services`: "all", or a list of service ids), so a toggle
 * here adds or removes this one service from that branch's list. A branch set to "all" already
 * carries every service, including this one, and has nothing to toggle.
 */
export function ServiceBranchSharing({
  serviceId,
  orgBase,
}: Readonly<{ serviceId: string; orgBase: string }>) {
  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    // Every page, not just the first 100: a branch past the cap would be unreachable here, with
    // no way to tell it apart from one deliberately not sharing. The endpoint caps `limit` at
    // 100, so this walks the pages; MAX_PAGES stops a pathological org turning one card into
    // dozens of requests.
    const MAX_PAGES = 10;
    const limit = 100;
    businessProfileDetailApi
      .getBranches({ page: 1, limit }, orgBase)
      .then(async (first) => {
        const pages = Math.min(Math.ceil(first.total / limit), MAX_PAGES);
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
            businessProfileDetailApi.getBranches({ page: i + 2, limit }, orgBase),
          ),
        );
        return [...first.data, ...rest.flatMap((r) => r.data)];
      })
      .then((all) => setBranches(all.filter((b) => !b.is_primary)))
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, [orgBase]);

  const toggle = async (branch: Branch) => {
    const current = branch.shared_services as string[];
    const shares = current.includes(serviceId);
    const next = shares ? current.filter((id) => id !== serviceId) : [...current, serviceId];
    setSaving(branch.id);
    try {
      await businessProfileDetailApi.updateBranch(branch.id, { shared_services: next }, orgBase);
      setBranches((prev) => prev.map((b) => (b.id === branch.id ? { ...b, shared_services: next } : b)));
      toast.success(shares ? `Removed from ${branch.name}` : `Shared with ${branch.name}`);
    } catch (e) {
      toast.error("Couldn't update sharing", { description: (e as Error).message });
    } finally {
      setSaving(null);
    }
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (branches.length === 0) {
    body = <p className="text-sm text-muted-foreground italic">No branches to share with yet.</p>;
  } else {
    body = (
      // Capped height: a long branch list would otherwise push the rest of the sidebar off-screen.
      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        <p className="text-sm text-muted-foreground">
          Share this service with your branches so it also appears in their listings.
        </p>
        {branches.map((branch) => {
          const sharesEverything = branch.shared_services === "all";
          return (
            <div key={branch.id} className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{branch.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[branch.city, branch.country].filter(Boolean).join(", ") || "No location set"}
                </p>
              </div>
              {sharesEverything ? (
                <Badge variant="secondary" className="shrink-0 text-xs">Shares all</Badge>
              ) : (
                <Switch
                  checked={(branch.shared_services as string[]).includes(serviceId)}
                  disabled={saving === branch.id}
                  onCheckedChange={() => toggle(branch)}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitBranch className="h-4 w-4 text-primary" />
          Branch sharing
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* The owner block, so it reads as "this office, plus these branches". */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <Avatar className="size-9 shrink-0 rounded-md bg-background">
            {profile?.logo_url && <AvatarImage src={profile.logo_url} alt="" className="rounded-md object-contain p-0.5" />}
            <AvatarFallback className="rounded-md text-xs font-semibold text-primary">
              {(profile?.business_name ?? "B").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Owner</p>
            <p className="truncate text-sm font-semibold">{profile?.business_name ?? "Business"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[profile?.city, profile?.state].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
        {body}
      </CardContent>
    </Card>
  );
}

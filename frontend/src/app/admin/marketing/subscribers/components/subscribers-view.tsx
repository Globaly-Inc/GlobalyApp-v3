"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchSubscribers, exportSubscribers } from "../store/subscribers-slice";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const sourceLabels: Record<string, string> = {
  newsletter: "Newsletter",
  early_interest: "Early Interest",
  guide_lead: "Guide Lead",
};

const sourceBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  newsletter: "default",
  early_interest: "secondary",
  guide_lead: "outline",
};

export function SubscribersView() {
  const dispatch = useAppDispatch();
  const { subscribers, page, limit, total, status } = useAppSelector((state) => state.marketingSubscribers);
  const [type, setType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchSubscribers({ page, limit, type: type !== "all" ? type : undefined, search: search || undefined }));
  }, [dispatch, page, limit]);

  const handleFilterChange = () => {
    dispatch(fetchSubscribers({ page: 1, limit, type: type !== "all" ? type : undefined, search: search || undefined }));
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleSearchSubmit = () => {
    dispatch(fetchSubscribers({ page: 1, limit, type: type !== "all" ? type : undefined, search: search || undefined }));
  };

  const handleExport = async () => {
    await dispatch(exportSubscribers({ type: type !== "all" ? type : undefined, search: search || undefined }));
    toast.success("Export started");
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Subscribers</h1>
        <p className="mt-1 text-muted-foreground">{total} total subscribers</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            className="h-9 pl-9"
            value={search}
            onChange={handleSearch}
            onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
          />
        </div>

        <Select value={type} onValueChange={(v) => setType(v ?? "all")}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="newsletter">Newsletter</SelectItem>
            <SelectItem value="early_interest">Early Interest</SelectItem>
            <SelectItem value="guide_lead">Guide Leads</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={handleFilterChange} variant="outline" size="sm">
          Apply
        </Button>

        <Button onClick={handleExport} variant="outline" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          {subscribers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No subscribers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Source</th>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Detail</th>
                    <th className="px-4 py-3 text-left font-medium">Subscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((subscriber, idx) => (
                    <tr key={`${subscriber.email}-${idx}`} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3">
                        <Badge variant={sourceBadgeVariant[subscriber.source]}>
                          {sourceLabels[subscriber.source]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{subscriber.name || "—"}</td>
                      <td className="px-4 py-3">{subscriber.email}</td>
                      <td className="px-4 py-3">{subscriber.detail || "—"}</td>
                      <td className="px-4 py-3">{formatDate(subscriber.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subscribers.length > 0 && totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => dispatch(fetchSubscribers({ page: page - 1, limit, type: type !== "all" ? type : undefined, search: search || undefined }))}
          >
            Previous
          </Button>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => dispatch(fetchSubscribers({ page: page + 1, limit, type: type !== "all" ? type : undefined, search: search || undefined }))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

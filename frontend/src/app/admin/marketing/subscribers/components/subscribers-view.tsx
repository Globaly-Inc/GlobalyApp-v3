"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const SUBSCRIBER_COLUMNS = [
  { label: "Source" },
  { label: "Name", className: "hidden md:table-cell" },
  { label: "Email" },
  { label: "Detail", className: "hidden lg:table-cell" },
  { label: "Subscribed", className: "hidden md:table-cell" },
] as const;

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
  const loadingFirstPage = status === "loading" && subscribers.length === 0;
  const filterParams = { type: type !== "all" ? type : undefined, search: search || undefined };

  return (
    <PageBody>
      <PageHeader title={<><Mail /> Subscribers</>} subtitle={`${total} total subscribers`}>
        <Button onClick={handleExport} variant="outline" className="gap-1.5">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </PageHeader>

      <FilterBar>
        <SearchInput
          placeholder="Search by email or name..."
          value={search}
          onChange={handleSearch}
          onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
        />

        <Select value={type} onValueChange={(v) => setType(v ?? "all")}>
          <SelectTrigger className="h-10 w-40 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="newsletter">Newsletter</SelectItem>
            <SelectItem value="early_interest">Early Interest</SelectItem>
            <SelectItem value="guide_lead">Guide Leads</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={handleFilterChange} variant="outline" className="h-10">
          Apply
        </Button>
      </FilterBar>

      {loadingFirstPage && <ListSkeleton count={6} itemClassName="h-12" />}
      {!loadingFirstPage && subscribers.length === 0 && <EmptyState icon={Mail} title="No subscribers found" />}
      {!loadingFirstPage && subscribers.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {SUBSCRIBER_COLUMNS.map((col) => (
                  <TableHead key={col.label} className={"className" in col ? col.className : undefined}>
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.map((subscriber, idx) => (
                <TableRow key={`${subscriber.email}-${idx}`}>
                  <TableCell>
                    <Badge variant={sourceBadgeVariant[subscriber.source]}>{sourceLabels[subscriber.source]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{subscriber.name || "—"}</TableCell>
                  <TableCell primary>
                    <p className="truncate font-medium text-foreground">{subscriber.email}</p>
                    {/* Fallbacks for the columns hidden on narrow screens. */}
                    <p className="truncate text-xs text-muted-foreground md:hidden">
                      {subscriber.name || "—"} · {formatDate(subscriber.created_at)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground lg:hidden">{subscriber.detail || "—"}</p>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell">{subscriber.detail || "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(subscriber.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {subscribers.length > 0 && totalPages > 1 && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={(next) => dispatch(fetchSubscribers({ page: next, limit, ...filterParams }))}
        />
      )}
    </PageBody>
  );
}

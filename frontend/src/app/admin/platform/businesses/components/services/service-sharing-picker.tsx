"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { businessesApi } from "../../apis";
import type { BusinessService, SharedServices } from "../../apis/types";

const PAGE_SIZE = 10;

export function ServiceSharingPicker({
  businessId,
  value,
  onChange,
  emptyText = "Head office has no services to share.",
}: Readonly<{
  businessId: number;
  value: SharedServices;
  onChange: (value: SharedServices) => void;
  emptyText?: string;
}>) {
  const [services, setServices] = useState<BusinessService[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // The page resets to 1 whenever the query changes — derived from the query key, not set in an effect.
  const queryKey = `${businessId}|${search}`;
  const [pager, setPager] = useState({ queryKey, page: 1 });
  const page = pager.queryKey === queryKey ? pager.page : 1;
  const isAll = value === "all";
  const selectedIds = isAll ? [] : value;

  const fetchPage = (p: number, q: string) => {
    setLoading(true);
    businessesApi
      .searchServices(businessId, { page: p, limit: PAGE_SIZE, search: q || undefined })
      .then((res) => {
        setServices(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchPage(1, search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, search]);

  const handlePageChange = (p: number) => {
    setPager({ queryKey, page: p });
    fetchPage(p, search);
  };

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const allPageSelected = services.length > 0 && services.every((s) => selectedIds.includes(s.id));
  const noServicesAtAll = total === 0 && !loading && !search;

  let servicesList: React.ReactNode;
  if (loading) {
    servicesList = (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (services.length === 0) {
    servicesList = <p className="rounded-lg border py-3 text-center text-xs italic text-muted-foreground">No services found.</p>;
  } else {
    servicesList = (
      <div className="divide-y rounded-lg border pr-1">
        {services.map((s) => {
          const isSelected = selectedIds.includes(s.id);
          return (
            <div key={s.id} className="flex items-center gap-3 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Package className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{s.name}</p>
                {s.category_name && <p className="truncate text-xs text-muted-foreground">{s.category_name}</p>}
              </div>
              <Switch checked={isSelected} onCheckedChange={() => toggle(s.id)} />
            </div>
          );
        })}
      </div>
    );
  }

  let content: React.ReactNode;
  if (noServicesAtAll) {
    content = <p className="rounded-lg border py-3 text-center text-xs italic text-muted-foreground">{emptyText}</p>;
  } else if (isAll) {
    content = (
      <p className="rounded-lg border bg-muted/40 py-3 text-center text-xs text-muted-foreground">
        All current and future services will be shared with this branch.
      </p>
    );
  } else {
    content = (
      <>
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>
          {selectedIds.length > 0 && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {selectedIds.length} selected
            </Badge>
          )}
          {services.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 text-xs"
              onClick={() =>
                onChange(
                  allPageSelected
                    ? selectedIds.filter((id) => !services.some((s) => s.id === id))
                    : Array.from(new Set([...selectedIds, ...services.map((s) => s.id)])),
                )
              }
            >
              {allPageSelected ? "Deselect page" : "Select page"}
            </Button>
          )}
        </div>
        {servicesList}
        {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>
          Share services <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        {!noServicesAtAll && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Share all
            <Switch checked={isAll} onCheckedChange={(checked) => onChange(checked ? "all" : [])} />
          </label>
        )}
      </div>
      {content}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { RegistrantType } from "../apis/types";
import { fetchWaitlist } from "../store/users-slice";

const TYPE_LABELS: Record<RegistrantType, string> = {
  student: "Student",
  institution: "Institution",
  service_provider: "Service provider",
  other: "Other",
  newsletter: "Newsletter",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function WaitlistTab() {
  const dispatch = useAppDispatch();
  const { waitlist, waitlistStatus } = useAppSelector((state) => state.adminUsers);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState("all");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const registrantType = type !== "all" ? (type as RegistrantType) : undefined;

  const fetchedRef = useRef(false);
  const lastFetchKey = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify({ search: debouncedSearch, type });
    if (fetchedRef.current && lastFetchKey.current === key) return;
    fetchedRef.current = true;
    lastFetchKey.current = key;
    dispatch(fetchWaitlist({ search: debouncedSearch || undefined, registrant_type: registrantType, limit: 10 }));
  }, [dispatch, debouncedSearch, type, registrantType]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            className="h-10 pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v ?? "all")}>
          <SelectTrigger className="h-10 w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {waitlistStatus === "loading" && waitlist.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {waitlistStatus !== "loading" && waitlist.data.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <ClipboardList className="h-8 w-8 opacity-30" />
            <p className="text-sm">No registrations found.</p>
          </div>
        )}
        {waitlist.data.map((entry) => (
          <div key={entry.uuid} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{entry.name || "—"}</p>
              <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary">{TYPE_LABELS[entry.registrant_type] ?? entry.registrant_type}</Badge>
              <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        page={waitlist.page}
        limit={waitlist.limit}
        total={waitlist.total}
        onPageChange={(page) =>
          dispatch(fetchWaitlist({ search: debouncedSearch || undefined, registrant_type: registrantType, page, limit: 10 }))
        }
      />
    </div>
  );
}

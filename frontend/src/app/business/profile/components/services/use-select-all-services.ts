"use client";

import { useState } from "react";
import { toast } from "sonner";
import { businessProfileDetailApi } from "../../apis";
import type { BusinessService, ServiceSearchParams } from "../../apis/types";

const PAGE = 100; // the list endpoint's max page size

/**
 * "Select all N courses" across every page: loads the whole list for the current search/tab so
 * bulk actions (and their counts) cover rows that aren't on screen. Tied to `scopeKey` — change
 * the search or tab and the loaded set no longer applies.
 * ponytail: one request per 100 rows, and bulk actions still fire one request per row; add
 * server-side bulk endpoints if catalogs reach the thousands.
 */
export function useSelectAllServices(scopeKey: string, params: Omit<ServiceSearchParams, "page" | "limit">) {
  const [loaded, setLoaded] = useState<{ key: string; rows: BusinessService[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const allRows = loaded?.key === scopeKey ? loaded.rows : null;

  const selectAll = async (): Promise<BusinessService[] | null> => {
    setLoading(true);
    try {
      const rows: BusinessService[] = [];
      for (let page = 1; ; page++) {
        const res = await businessProfileDetailApi.searchServices({ ...params, page, limit: PAGE });
        rows.push(...res.data);
        if (res.data.length < PAGE || rows.length >= res.total) break;
      }
      setLoaded({ key: scopeKey, rows });
      return rows;
    } catch (e) {
      toast.error("Couldn't select all", { description: (e as Error).message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { allRows, selectAll, clear: () => setLoaded(null), loading };
}

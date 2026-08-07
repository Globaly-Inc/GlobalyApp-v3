"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { fetchCategories } from "../store/categories-slice";
import { CATEGORY_TABS, CATEGORY_COLUMNS } from "../const";
import type { CategoryTab } from "../types";

export function CategoriesView() {
  const dispatch = useAppDispatch();
  const { data } = useAppSelector((state) => state.platformCategories);
  const [tab, setTab] = useState<CategoryTab>("business");

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Categories</h1>
        <p className="text-muted-foreground mt-1">Manage the platform&apos;s shared taxonomy.</p>
      </div>

      <AdminSegmentedTabs options={CATEGORY_TABS} value={tab} onChange={setTab} />

      <AdminRecordsCard columns={CATEGORY_COLUMNS[tab]} rows={data?.[tab] ?? []} />
    </div>
  );
}

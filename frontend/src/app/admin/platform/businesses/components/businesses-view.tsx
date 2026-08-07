"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchBusinesses } from "../store/businesses-slice";
import { BUSINESS_COLUMNS } from "../const";

export function BusinessesView() {
  const dispatch = useAppDispatch();
  const { businesses } = useAppSelector((state) => state.platformBusinesses);

  useEffect(() => {
    dispatch(fetchBusinesses());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Businesses</h1>
        <p className="text-muted-foreground mt-1">Manage registered businesses, agents, and institutions on the platform.</p>
      </div>

      <AdminRecordsCard columns={BUSINESS_COLUMNS} rows={businesses} />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchVisas } from "../store/visas-slice";
import { VISA_COLUMNS } from "../const";

export function VisasView() {
  const dispatch = useAppDispatch();
  const { visas } = useAppSelector((state) => state.dataVisas);

  useEffect(() => {
    dispatch(fetchVisas());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Visas</h1>
        <p className="text-muted-foreground mt-1">Visa subclasses extracted from immigration department sites, staged for promotion.</p>
      </div>

      <AdminRecordsCard columns={VISA_COLUMNS} rows={visas} />
    </div>
  );
}

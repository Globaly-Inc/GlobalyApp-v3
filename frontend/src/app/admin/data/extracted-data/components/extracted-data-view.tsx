"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchExtractedData } from "../store/extracted-data-slice";
import { EXTRACTED_DATA_COLUMNS } from "../const";

export function ExtractedDataView() {
  const dispatch = useAppDispatch();
  const { institutions } = useAppSelector((state) => state.dataExtractedData);

  useEffect(() => {
    dispatch(fetchExtractedData());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Extracted Data</h1>
        <p className="text-muted-foreground mt-1">Institutions whose extraction has completed and been reviewed.</p>
      </div>

      <AdminRecordsCard columns={EXTRACTED_DATA_COLUMNS} rows={institutions} />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchEnquiries } from "../store/enquiries-slice";
import { ENQUIRY_COLUMNS } from "../const";

export function EnquiriesView() {
  const dispatch = useAppDispatch();
  const { enquiries } = useAppSelector((state) => state.monitoringEnquiries);

  useEffect(() => {
    dispatch(fetchEnquiries());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Enquiries</h1>
        <p className="text-muted-foreground mt-1">Enquiry management — review and respond to platform enquiries.</p>
      </div>

      <AdminRecordsCard columns={ENQUIRY_COLUMNS} rows={enquiries} />
    </div>
  );
}

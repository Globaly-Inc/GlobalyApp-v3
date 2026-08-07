"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchModerationFlags } from "../store/moderation-slice";
import { MODERATION_COLUMNS } from "../const";

export function ModerationView() {
  const dispatch = useAppDispatch();
  const { flags } = useAppSelector((state) => state.monitoringModeration);

  useEffect(() => {
    dispatch(fetchModerationFlags());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Moderation</h1>
        <p className="text-muted-foreground mt-1">Manage suspended accounts and content flags.</p>
      </div>

      <AdminRecordsCard columns={MODERATION_COLUMNS} rows={flags} />
    </div>
  );
}

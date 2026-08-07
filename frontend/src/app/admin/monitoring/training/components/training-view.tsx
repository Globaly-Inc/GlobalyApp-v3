"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchTrainingPrograms } from "../store/training-slice";
import { TRAINING_COLUMNS } from "../const";

export function TrainingView() {
  const dispatch = useAppDispatch();
  const { programs } = useAppSelector((state) => state.monitoringTraining);

  useEffect(() => {
    dispatch(fetchTrainingPrograms());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Training</h1>
        <p className="text-muted-foreground mt-1">Manage training programs offered across the platform.</p>
      </div>

      <AdminRecordsCard columns={TRAINING_COLUMNS} rows={programs} />
    </div>
  );
}

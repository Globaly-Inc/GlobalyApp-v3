"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuditLogs } from "../store/logs-slice";

export function LogsView() {
  const dispatch = useAppDispatch();
  const { logs } = useAppSelector((state) => state.monitoringLogs);

  useEffect(() => {
    dispatch(fetchAuditLogs());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">A timestamped feed of admin actions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">{log.action}</p>
                <p className="text-muted-foreground">{log.actor}</p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">{log.when}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

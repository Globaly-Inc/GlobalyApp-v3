"use client";

import { useEffect, useRef } from "react";
import { ScrollText } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Card } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { fetchAuditLogs } from "../store/logs-slice";

/** Audit log as a notification-style feed (mockup C8): one card of flat rows, newest first. */
export function LogsView() {
  const dispatch = useAppDispatch();
  const { logs } = useAppSelector((state) => state.monitoringLogs);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchAuditLogs());
  }, [dispatch]);

  return (
    <PageBody className="mx-auto w-full max-w-3xl">
      <PageHeader title={<><ScrollText /> Audit Logs</>} subtitle="A timestamped feed of admin actions." />

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent activity</h2>
        <Card className="gap-0 py-0">
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{log.action}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{log.actor}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{log.when}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </PageBody>
  );
}

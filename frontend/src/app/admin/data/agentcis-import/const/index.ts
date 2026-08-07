import type { AdminListColumn } from "../../../components/admin-placeholder-view";

export const AGENTCIS_IMPORT_COLUMNS: AdminListColumn[] = [
  { key: "batch", label: "Import batch" },
  { key: "agents", label: "Agents imported" },
  { key: "status", label: "Status" },
  { key: "date", label: "Date" },
];

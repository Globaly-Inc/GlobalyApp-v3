import type { AdminListColumn } from "../../../components/admin-placeholder-view";

export const TRAINING_COLUMNS: AdminListColumn[] = [
  { key: "name", label: "Program" },
  { key: "provider", label: "Provider" },
  { key: "updated", label: "Last updated" },
  { key: "status", label: "Status" },
];

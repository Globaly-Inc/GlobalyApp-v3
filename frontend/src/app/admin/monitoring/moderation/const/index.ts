import type { AdminListColumn } from "../../../components/admin-placeholder-view";

export const MODERATION_COLUMNS: AdminListColumn[] = [
  { key: "entity", label: "Entity" },
  { key: "type", label: "Type" },
  { key: "reason", label: "Reason" },
  { key: "status", label: "Status" },
];

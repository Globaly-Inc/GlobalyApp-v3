import type { AdminListColumn } from "../../../components/admin-placeholder-view";

export const SCHOLARSHIP_COLUMNS: AdminListColumn[] = [
  { key: "title", label: "Scholarship" },
  { key: "provider_name", label: "Provider" },
  { key: "country", label: "Country" },
  { key: "deadline", label: "Deadline" },
  { key: "is_published", label: "Published" },
  { key: "is_featured", label: "Featured" },
];

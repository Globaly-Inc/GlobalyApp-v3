import { AdminPlaceholderView } from "../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "country", label: "Country" },
  { key: "updated", label: "Last updated" },
  { key: "status", label: "Status" },
];

const ROWS = [
  { id: 1, title: "5 Things to Know Before Studying in Canada", country: "Canada", updated: "3 days ago", status: "Published" },
  { id: 2, title: "UK Graduate Visa Route Explained", country: "United Kingdom", updated: "yesterday", status: "Draft" },
];

export default function AdminBlogPage() {
  return (
    <AdminPlaceholderView
      title="Blog"
      description="Blog management — country-tagged articles for the marketing site."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}

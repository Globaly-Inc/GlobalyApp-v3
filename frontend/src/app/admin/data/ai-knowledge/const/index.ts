import type { AdminListColumn } from "../../../components/admin-placeholder-view";
import type { KnowledgeTab } from "../types";

export const KNOWLEDGE_TABS: { value: KnowledgeTab; label: string }[] = [
  { value: "rack", label: "Knowledge Rack" },
  { value: "visa", label: "Visa" },
  { value: "faqs", label: "FAQs" },
  { value: "guides", label: "Guides" },
  { value: "queue", label: "Queue" },
];

export const KNOWLEDGE_COLUMNS: Record<KnowledgeTab, AdminListColumn[]> = {
  rack: [{ key: "title", label: "Title" }, { key: "category", label: "Category" }, { key: "status", label: "Status" }],
  visa: [{ key: "title", label: "Title" }, { key: "country", label: "Country" }, { key: "status", label: "Status" }],
  faqs: [{ key: "question", label: "Question" }, { key: "category", label: "Category" }],
  guides: [{ key: "title", label: "Title" }, { key: "readTime", label: "Read time" }],
  queue: [{ key: "title", label: "Title" }, { key: "submittedBy", label: "Submitted by" }, { key: "status", label: "Status" }],
};

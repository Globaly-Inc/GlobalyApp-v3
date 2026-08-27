import type { SubscribersResponse } from "./types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockSubscribers = [
  { source: "newsletter" as const, name: "", email: "jane@newsletter.test", detail: null, created_at: new Date().toISOString() },
  { source: "newsletter" as const, name: "Jane Newsletter", email: "jane2@newsletter.test", detail: null, created_at: new Date().toISOString() },
  { source: "early_interest" as const, name: "John Student", email: "john@student.test", detail: "student", created_at: new Date().toISOString() },
  { source: "guide_lead" as const, name: "Bob Guide", email: "bob@guide.test", detail: "Study Abroad Guide", created_at: new Date().toISOString() },
];

export const subscribersListMockApi = async (page = 1, limit = 20, type?: string, search?: string): Promise<SubscribersResponse> => {
  await delay(300);
  console.log("[mock] subscribers list", { page, limit, type, search });

  let filtered = mockSubscribers;
  if (type) filtered = filtered.filter((s) => s.source === type);
  if (search) {
    const needle = search.toLowerCase();
    filtered = filtered.filter((s) => s.email.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle));
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  return {
    data,
    meta: { page, limit, total },
  };
};

export const subscribersExportMockApi = async (type?: string, search?: string): Promise<string> => {
  await delay(300);
  console.log("[mock] subscribers export", { type, search });

  let filtered = mockSubscribers;
  if (type) filtered = filtered.filter((s) => s.source === type);
  if (search) {
    const needle = search.toLowerCase();
    filtered = filtered.filter((s) => s.email.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle));
  }

  const lines = ["Source,Name,Email,Detail,Created At"];
  filtered.forEach((s) => {
    const fields = [s.source, s.name, s.email, s.detail || "", s.created_at];
    lines.push(fields.map((f) => (f.includes(",") || f.includes('"') ? `"${String(f).replace(/"/g, '""')}"` : f)).join(","));
  });

  return lines.join("\n");
};

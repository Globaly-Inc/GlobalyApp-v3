import type { AdminEvent } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockEvents: AdminEvent[] = [
  { id: 1, name: "Study Abroad Fair — Sydney", date: "2026-09-14", location: "Sydney, AU", status: "Published" },
  { id: 2, name: "Virtual Scholarship Info Session", date: "2026-08-22", location: "Online", status: "Draft" },
];

export const eventsMockApi = {
  getEvents: async (): Promise<AdminEvent[]> => {
    console.log("[mock] GET /admin/events");
    await delay(300);
    return mockEvents;
  },
};

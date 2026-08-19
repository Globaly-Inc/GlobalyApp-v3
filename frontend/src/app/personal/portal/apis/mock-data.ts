import type { RecentEnquiries } from "./types";

export const homeMockApi = {
  // Deliberately empty: nothing in this codebase creates an enquiry yet, and inventing rows here would
  // make the rail look populated in mock mode and empty against the real API. The card hides itself when
  // there are none, and the stat tile shows a truthful 0.
  listRecentEnquiries: async (): Promise<RecentEnquiries> => {
    console.log("[mock] GET /enquiries?page=1&limit=5");
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { items: [], total: 0 };
  },
};

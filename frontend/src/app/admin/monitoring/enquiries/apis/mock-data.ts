import type { Enquiry } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockEnquiries: Enquiry[] = [
  { id: 1, name: "Aarav Sharma", subject: "Refund for application fee", channel: "Contact form", status: "Pending" },
  { id: 2, name: "Mei Lin", subject: "Business claim dispute", channel: "Email", status: "Completed" },
];

export const enquiriesMockApi = {
  getEnquiries: async (): Promise<Enquiry[]> => {
    console.log("[mock] GET /admin/enquiries");
    await delay(300);
    return mockEnquiries;
  },
};

import type { KnowledgeByTab } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockKnowledge: KnowledgeByTab = {
  rack: [
    { id: 1, title: "IELTS vs PTE — which to choose", category: "Language Tests", status: "Published" },
    { id: 2, title: "How Australian student visas work", category: "Visas", status: "Published" },
  ],
  visa: [
    { id: 1, title: "Student Visa 500 — full guide", country: "Australia", status: "Published" },
    { id: 2, title: "Study Permit basics", country: "Canada", status: "Draft" },
  ],
  faqs: [
    { id: 1, question: "How long does visa processing take?", category: "Visas" },
    { id: 2, question: "Can I work while studying?", category: "Work Rights" },
  ],
  guides: [
    { id: 1, title: "Complete guide to studying in the UK", readTime: "12 min" },
    { id: 2, title: "Budgeting for international students", readTime: "8 min" },
  ],
  queue: [
    { id: 1, title: "Post-study work rights update", submittedBy: "AI Extraction", status: "Pending" },
    { id: 2, title: "New scholarship guide draft", submittedBy: "admin@globalyhub.com", status: "Pending" },
  ],
};

export const aiKnowledgeMockApi = {
  getKnowledge: async (): Promise<KnowledgeByTab> => {
    console.log("[mock] GET /admin/ai-knowledge");
    await delay(300);
    return mockKnowledge;
  },
};

export interface Subscriber {
  source: "newsletter" | "early_interest" | "guide_lead";
  name: string;
  email: string;
  detail: string | null;
  created_at: string;
}

export interface SubscribersResponse {
  data: Subscriber[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

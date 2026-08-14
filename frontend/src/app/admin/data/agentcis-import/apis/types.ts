export type AgentCISResult = {
  id: number;
  name: string;
  type: string;
  country: string;
  region: string;
};

export type ImportResult = {
  dispatched: boolean;
  job_count: number;
};

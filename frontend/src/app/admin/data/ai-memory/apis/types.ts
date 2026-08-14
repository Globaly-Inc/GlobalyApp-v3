export type Lesson = {
  id: string;
  scope: string;
  domain: string | null;
  step: string | null;
  rule: string;
  example_bad: string | null;
  example_good: string | null;
  source: string;
  weight: number;
  is_active: boolean;
  created_at: string;
};

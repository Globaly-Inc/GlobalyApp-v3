export type Lead = {
  id: string;
  company: string;
  stage: "new" | "contacted" | "qualified" | "won" | "lost";
};

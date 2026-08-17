import { AdminNotAvailableView } from "../../../components/admin-not-available-view";

export function JobsView() {
  return (
    <AdminNotAvailableView
      title="Jobs"
      description="Job postings across all businesses, with search and status filters."
      wave="G"
      waveScope="Wave G builds the jobs board (G2: posting, applicants, search, AI assist). This page lists job postings, not extraction jobs — for extraction job health see Data · All Extractions."
    />
  );
}

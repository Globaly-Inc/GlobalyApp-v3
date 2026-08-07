import { JobDetailView } from "../components/job-detail-view";

export default async function AdminExtractionJobDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <JobDetailView jobId={id} />;
}

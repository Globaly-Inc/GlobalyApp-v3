import { VisitorDetailView } from "../../components/visitor-detail-view";

export default async function VisitorDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <VisitorDetailView visitorId={Number(id)} />;
}

import { BusinessDetailView } from "../components/business-detail-view";

export default async function AdminBusinessDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <BusinessDetailView id={Number(id)} />;
}

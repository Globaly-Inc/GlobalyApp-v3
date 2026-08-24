import { BusinessOrInstitutionDetailView } from "../components/business-or-institution-detail-view";

export default async function AdminBusinessDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <BusinessOrInstitutionDetailView id={Number(id)} />;
}

import { InstitutionServiceFormView } from "@/app/admin/platform/businesses/components/institution-service-form-view";

export default async function AdminAddInstitutionServicePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <InstitutionServiceFormView institutionId={Number(id)} />;
}

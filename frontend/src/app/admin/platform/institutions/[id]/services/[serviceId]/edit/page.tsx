import { InstitutionServiceFormView } from "@/app/admin/platform/businesses/components/institution-service-form-view";

export default async function AdminEditInstitutionServicePage({
  params,
}: Readonly<{ params: Promise<{ id: string; serviceId: string }> }>) {
  const { id, serviceId } = await params;
  return <InstitutionServiceFormView institutionId={Number(id)} serviceId={serviceId} />;
}

import { ServicePreviewView } from "@/app/admin/platform/businesses/components/services/service-preview-view";

export default async function AdminInstitutionServicePreviewPage({
  params,
}: Readonly<{ params: Promise<{ id: string; serviceId: string }> }>) {
  const { id, serviceId } = await params;
  return <ServicePreviewView kind="institution" orgId={Number(id)} serviceId={serviceId} />;
}

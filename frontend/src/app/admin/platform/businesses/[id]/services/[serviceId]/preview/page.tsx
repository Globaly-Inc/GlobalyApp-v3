import { ServicePreviewView } from "../../../../components/services/service-preview-view";

export default async function AdminServicePreviewPage({
  params,
}: Readonly<{ params: Promise<{ id: string; serviceId: string }> }>) {
  const { id, serviceId } = await params;
  return <ServicePreviewView kind="business" orgId={Number(id)} serviceId={serviceId} />;
}

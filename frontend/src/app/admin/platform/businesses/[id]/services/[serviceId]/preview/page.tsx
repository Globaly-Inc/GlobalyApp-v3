import { ServicePreviewView } from "../../../../components/services/service-preview-view";
import { ServicePreviewChrome } from "./service-preview-chrome";

export default async function AdminServicePreviewPage({
  params,
}: Readonly<{ params: Promise<{ id: string; serviceId: string }> }>) {
  const { id, serviceId } = await params;
  return (
    <ServicePreviewChrome>
      <ServicePreviewView kind="business" orgId={Number(id)} serviceId={serviceId} embedded />
    </ServicePreviewChrome>
  );
}

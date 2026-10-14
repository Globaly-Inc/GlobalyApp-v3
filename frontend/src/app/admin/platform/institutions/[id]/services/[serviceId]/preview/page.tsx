import { ServicePreviewView } from "@/app/admin/platform/businesses/components/services/service-preview-view";
import { ServicePreviewChrome } from "@/app/admin/platform/businesses/[id]/services/[serviceId]/preview/service-preview-chrome";

export default async function AdminInstitutionServicePreviewPage({
  params,
}: Readonly<{ params: Promise<{ id: string; serviceId: string }> }>) {
  const { id, serviceId } = await params;
  return (
    <ServicePreviewChrome>
      <ServicePreviewView kind="institution" orgId={Number(id)} serviceId={serviceId} embedded />
    </ServicePreviewChrome>
  );
}

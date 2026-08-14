import { ServiceFormView } from "../../../../components/service-form-view";

export default async function AdminEditServicePage({
  params,
}: Readonly<{ params: Promise<{ id: string; serviceId: string }> }>) {
  const { id, serviceId } = await params;
  return <ServiceFormView businessId={Number(id)} serviceId={serviceId} />;
}

import { notFound } from "next/navigation";
import { ServiceDetailView } from "./components/service-detail-view";

export default async function ServiceDetailPage({
  params,
}: Readonly<{ params: Promise<{ serviceId: string }> }>) {
  const { serviceId } = await params;
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <ServiceDetailView serviceId={id} />;
}

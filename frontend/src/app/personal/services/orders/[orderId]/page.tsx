import { notFound } from "next/navigation";
import { OrderDetailView } from "../../components/order-detail-view";

export default async function OrderDetailPage({ params }: Readonly<{ params: Promise<{ orderId: string }> }>) {
  const { orderId } = await params;
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <OrderDetailView orderId={id} />;
}

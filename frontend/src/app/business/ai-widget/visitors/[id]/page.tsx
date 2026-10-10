import { redirect } from "next/navigation";
import { visitorHref } from "../../const";

// Moved to Contacts → Visitors; kept for old links.
export default async function VisitorDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  redirect(visitorHref(Number(id)));
}

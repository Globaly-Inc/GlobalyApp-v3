import { EventRegistrantsView } from "../../components/event-registrants-view";

export default async function EventRegistrantsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventRegistrantsView eventId={Number(eventId)} />;
}

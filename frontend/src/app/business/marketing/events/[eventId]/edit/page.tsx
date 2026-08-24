import { EditEventView } from "../../components/edit-event-view";

export default async function EditBusinessEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EditEventView eventId={Number(eventId)} />;
}

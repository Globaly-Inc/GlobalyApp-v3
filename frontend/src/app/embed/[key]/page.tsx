import { EmbedChatView } from "./components/embed-chat-view";

type EmbedPageProps = Readonly<{ params: Promise<{ key: string }> }>;

export default async function EmbedPage({ params }: EmbedPageProps) {
  const { key } = await params;
  return <EmbedChatView embedKey={key} />;
}

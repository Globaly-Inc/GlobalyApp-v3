import { embedApi } from "./apis";
import { EmbedChatView } from "./components/embed-chat-view";

type EmbedPageProps = Readonly<{ params: Promise<{ key: string }> }>;

export default async function EmbedPage({ params }: EmbedPageProps) {
  const { key } = await params;
  // Fetched here so the panel's first paint already wears the widget's brand colour, instead of
  // the default for the moment a client fetch takes. On failure the view fetches it itself
  // (and shows the "unavailable" message as before).
  const initialConfig = await embedApi.resolveConfig(key).catch(() => null);
  return <EmbedChatView embedKey={key} initialConfig={initialConfig} />;
}

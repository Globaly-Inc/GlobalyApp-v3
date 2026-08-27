import { AiChatView } from "./components/ai-chat-view";

export default async function AiPublicPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const { q } = await searchParams;
  return <AiChatView initialQuery={q} redirectIfAuthenticated />;
}

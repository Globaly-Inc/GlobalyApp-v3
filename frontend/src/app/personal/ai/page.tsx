import { AiChatView } from "@/app/ai/components/ai-chat-view";

export default async function AiCounsellorPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const { q } = await searchParams;
  return <AiChatView initialQuery={q} />;
}

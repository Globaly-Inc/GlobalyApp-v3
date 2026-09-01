import { AiPublicHeader } from "./components/ai-public-header";

export const metadata = {
  title: "Aly — AI Counsellor by Globaly",
  description: "Get personalised study abroad advice from Aly, Globaly's AI Counsellor.",
};

export default function AiPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AiPublicHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}

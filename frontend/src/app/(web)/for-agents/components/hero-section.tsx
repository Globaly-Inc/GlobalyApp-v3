import { Badge } from "@/components/ui/badge";
import { AutoplayVideo } from "../../components/autoplay-video";
import { UnifiedSearchBar } from "../../components/unified-search-bar";

export function HeroSection({
  displayText,
  showCursor,
}: Readonly<{ displayText: string; showCursor: boolean }>) {
  return (
    <section className="relative min-h-[calc(100svh-64px)] md:min-h-[620px] flex items-center overflow-hidden">
      <AutoplayVideo
        src="https://videos.pexels.com/video-files/8033854/8033854-uhd_2560_1440_25fps.mp4"
        poster="https://images.pexels.com/videos/8033854/adult-brainstorming-business-child-8033854.jpeg?auto=compress&w=1920"
        className="absolute inset-0 w-full h-full object-cover scale-105"
        style={{ transformOrigin: "center" }}
      />
      <div className="absolute inset-0 bg-[hsl(var(--purple-dark))]/80" />
      <div className="container relative mx-auto px-4 py-16 md:py-20 z-10">
        <div className="max-w-4xl mx-auto text-center py-8 md:py-[50px] pb-[20px] pt-[60px]">
          <Badge className="mb-4 bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30 text-xs font-semibold px-3 py-1 rounded-full">
            For Agents
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Grow Your Agency
            <br />
            <span className="text-[hsl(var(--gold))] inline-block min-h-[1.2em]">
              {displayText}
              <span style={{ opacity: showCursor ? 1 : 0, transition: "opacity 0.1s" }}>|</span>
            </span>
          </h1>
          <p className="text-white/80 text-base mb-8 max-w-2xl mx-auto">
            Connect with top institutions, access verified student leads, and scale your consultancy — all in one
            transparent, fair platform.
          </p>
          <UnifiedSearchBar />
        </div>
      </div>
    </section>
  );
}

/**
 * Strip ```course-card / ```chips blocks from AI text — they arrive as separate
 * SSE events and render as cards/buttons, not prose. Mirrors the backend's
 * card-parser stripBlocks, plus hides a trailing block that is still streaming
 * (a half-received fence would otherwise flash as a growing code block).
 */
export function stripStructuredBlocks(text: string): string {
  return text
    .replace(/```(?:course-card|chips)\n[\s\S]*?\n```/g, "")
    .replace(/```(?:course-card|chips)[\s\S]*$/, "")
    .trim();
}

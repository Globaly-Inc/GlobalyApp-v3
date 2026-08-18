import { describe, expect, it } from "vitest";
import { isWebUrl, webUrl } from "../../src/shared/url.js";

describe("webUrl", () => {
  // The whole reason this helper exists: z.string().url() accepts every one of these.
  it.each([
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("rejects the script-bearing scheme %s", (value) => {
    expect(webUrl().safeParse(value).success).toBe(false);
  });

  it.each([
    "https://example.com/scholarship",
    "http://example.com",
    "https://example.com/a?b=c#d",
  ])("accepts %s", (value) => {
    expect(webUrl().safeParse(value).success).toBe(true);
  });

  it.each(["", "not a url", "/relative/path", "example.com"])(
    "rejects the non-absolute value %s",
    (value) => {
      expect(webUrl().safeParse(value).success).toBe(false);
    },
  );

  it("trims before validating, so padding cannot smuggle a scheme past it", () => {
    expect(webUrl().parse("  https://example.com  ")).toBe("https://example.com");
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("webUrl({ max })", () => {
  it("still enforces length, which .refine() would otherwise strip off", () => {
    const schema = webUrl({ max: 20 });
    expect(schema.safeParse("https://example.com").success).toBe(true);
    expect(schema.safeParse("https://example.com/way/too/long").success).toBe(false);
  });
});

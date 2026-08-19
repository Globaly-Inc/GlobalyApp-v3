// The guard between a stored URL and an anchor href. React does not sanitize href,
// so anything this lets through is executed by the browser on click.
//
// The V1 migration copied ~140k rows byte-faithfully and the extraction pipeline
// scrapes URLs off third-party pages; neither passed through the backend's webUrl()
// write guard, so these are the values this has to hold against.

import { describe, expect, it } from "vitest";

import { safeUrl } from "@/lib/safe-url";

describe("safeUrl", () => {
  it("passes an ordinary http(s) URL through unchanged", () => {
    expect(safeUrl("https://apiccollege.edu.au")).toBe("https://apiccollege.edu.au");
    expect(safeUrl("http://example.com/a?b=c#d")).toBe("http://example.com/a?b=c#d");
  });

  it("rejects javascript: in every casing and whitespace form a stored value can take", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeUrl("  javascript:alert(1)  ")).toBeNull();
    // The URL parser strips these control characters, so a blocklist on the raw
    // string would miss it while the browser still honours the scheme.
    expect(safeUrl("java\tscript:alert(1)")).toBeNull();
  });

  it("rejects data: — an allowlist, not a javascript: blocklist", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBeNull();
  });

  it("rejects every other scheme a renderer might honour", () => {
    expect(safeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeUrl("blob:https://example.com/uuid")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects values that are not absolute URLs at all", () => {
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl("")).toBeNull();
    // A bare GCS object key, which is what unsigned cover_url columns actually hold.
    expect(safeUrl("v1/avatars/covers/abc/biz-1.png")).toBeNull();
  });
});

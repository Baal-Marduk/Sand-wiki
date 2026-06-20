import { describe, it, expect } from "vitest";
import { dataUrlToWebpBuffer } from "@/lib/thumbs";

describe("dataUrlToWebpBuffer", () => {
  it("decodes a webp data URL to a Buffer", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const buf = dataUrlToWebpBuffer(`data:image/webp;base64,${b64}`);
    expect(buf.toString()).toBe("hello");
  });

  it("rejects non-webp data URLs", () => {
    expect(() => dataUrlToWebpBuffer("data:image/png;base64,AAAA")).toThrow();
  });

  it("rejects oversized thumbnails", () => {
    // 500KB of base64 'A' decodes to ~375KB... build one safely over the 400KB cap.
    const big = "A".repeat(600_000); // ~450KB decoded, over the 400KB cap
    expect(() => dataUrlToWebpBuffer(`data:image/webp;base64,${big}`)).toThrow(/too large/);
  });
});

import { describe, it, expect } from "vitest";
import { thumbFileName, isSafeThumbName, dataUrlToWebpBuffer } from "@/lib/thumbs";

describe("thumbs helpers", () => {
  it("builds a .webp filename from a slug", () => {
    expect(thumbFileName("dustline-hauler-a1b2")).toBe("dustline-hauler-a1b2.webp");
  });

  it("accepts only safe webp filenames", () => {
    expect(isSafeThumbName("abc-123.webp")).toBe(true);
    expect(isSafeThumbName("../../etc/passwd")).toBe(false);
    expect(isSafeThumbName("a/b.webp")).toBe(false);
    expect(isSafeThumbName("a.png")).toBe(false);
  });

  it("decodes a webp data URL to a Buffer", () => {
    // 1x1 webp is fine; just assert it round-trips the base64 payload.
    const b64 = Buffer.from("hello").toString("base64");
    const buf = dataUrlToWebpBuffer(`data:image/webp;base64,${b64}`);
    expect(buf.toString()).toBe("hello");
  });

  it("rejects non-webp data URLs", () => {
    expect(() => dataUrlToWebpBuffer("data:image/png;base64,AAAA")).toThrow();
  });
});

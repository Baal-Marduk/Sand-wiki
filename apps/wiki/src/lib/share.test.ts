import { describe, it, expect } from "vitest";
import { designShareUrl } from "@/lib/share";

describe("designShareUrl", () => {
  it("joins origin and slug into the /builder/<slug> path", () => {
    expect(designShareUrl("rustgut-ab12cd", "https://x.test")).toBe(
      "https://x.test/builder/rustgut-ab12cd",
    );
  });
  it("strips trailing slashes from the origin", () => {
    expect(designShareUrl("a", "https://x.test/")).toBe("https://x.test/builder/a");
  });
});

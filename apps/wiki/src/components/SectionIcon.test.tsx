import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionIcon } from "./SectionIcon";

describe("SectionIcon", () => {
  it("renders an svg glyph for a known section slug", () => {
    const html = renderToStaticMarkup(<SectionIcon slug="enemies" />);
    expect(html).toContain("<svg");
  });

  it("renders a fallback svg for an unknown slug", () => {
    const html = renderToStaticMarkup(<SectionIcon slug="does-not-exist" />);
    expect(html).toContain("<svg");
  });
});

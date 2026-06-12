import { describe, it, expect } from "vitest";
import { parseDescription, collectSlugs } from "./description-links";

describe("parseDescription", () => {
  it("returns a single text segment when there are no links", () => {
    expect(parseDescription("just plain text")).toEqual([{ type: "text", value: "just plain text" }]);
  });

  it("parses a bare [[slug]] link with no explicit label", () => {
    expect(parseDescription("use [[iron-plate]] here")).toEqual([
      { type: "text", value: "use " },
      { type: "link", slug: "iron-plate" },
      { type: "text", value: " here" },
    ]);
  });

  it("parses [[slug|label]] with an explicit label", () => {
    expect(parseDescription("made of [[iron-plate|reinforced plates]].")).toEqual([
      { type: "text", value: "made of " },
      { type: "link", slug: "iron-plate", label: "reinforced plates" },
      { type: "text", value: "." },
    ]);
  });

  it("parses multiple links and trims slug whitespace", () => {
    const segs = parseDescription("[[a]] and [[ b | B ]]");
    expect(segs).toEqual([
      { type: "link", slug: "a" },
      { type: "text", value: " and " },
      { type: "link", slug: "b", label: "B" },
    ]);
  });

  it("treats empty [[]] as literal text", () => {
    expect(parseDescription("nothing [[]] here")).toEqual([{ type: "text", value: "nothing [[]] here" }]);
  });
});

describe("collectSlugs", () => {
  it("returns unique link slugs in first-seen order", () => {
    const segs = parseDescription("[[a]] [[b]] [[a]]");
    expect(collectSlugs(segs)).toEqual(["a", "b"]);
  });

  it("returns [] when there are no links", () => {
    expect(collectSlugs(parseDescription("plain"))).toEqual([]);
  });
});

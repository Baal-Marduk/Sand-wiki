// prisma/import-trampler-icons.test.ts
import { describe, it, expect } from "vitest";
import { publicIconPath } from "./import-trampler-icons.mjs";

describe("publicIconPath", () => {
  it("maps a manifest rel path to a /tramplers public path", () => {
    expect(publicIconPath("part-icons/walker_compArmor_Spot_Metal_1x1_icon.png"))
      .toBe("/tramplers/walker_compArmor_Spot_Metal_1x1_icon.png");
  });
});

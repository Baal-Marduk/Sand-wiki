import { describe, it, expect } from "vitest";
import { isAdmin } from "./auth";

describe("isAdmin", () => {
  it("matches a steamid in the allowlist", () => {
    expect(isAdmin("76561198000000000", "76561198000000000, 76561198111111111")).toBe(true);
  });
  it("rejects ids not in the allowlist", () => {
    expect(isAdmin("76561198999999999", "76561198000000000")).toBe(false);
  });
  it("treats an empty allowlist as no admins", () => {
    expect(isAdmin("76561198000000000", "")).toBe(false);
    expect(isAdmin("76561198000000000", undefined)).toBe(false);
  });
});

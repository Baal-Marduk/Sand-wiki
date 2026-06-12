import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session";

const SECRET = "test-secret";

describe("session token", () => {
  it("round-trips a valid payload", () => {
    const token = signSession({ steamId: "76561198000000000", exp: 2_000 }, SECRET);
    expect(verifySession(token, SECRET, 1_000)).toEqual({ steamId: "76561198000000000", exp: 2_000 });
  });

  it("rejects a tampered body", () => {
    const token = signSession({ steamId: "76561198000000000", exp: 2_000 }, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ steamId: "1", exp: 2_000 })).toString("base64url") + "." + sig;
    expect(verifySession(forged, SECRET, 1_000)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const token = signSession({ steamId: "x", exp: 2_000 }, SECRET);
    expect(verifySession(token, "other", 1_000)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession({ steamId: "x", exp: 1_000 }, SECRET);
    expect(verifySession(token, SECRET, 1_000)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySession("garbage", SECRET, 1_000)).toBeNull();
    expect(verifySession("a.b.c", SECRET, 1_000)).toBeNull();
  });
});

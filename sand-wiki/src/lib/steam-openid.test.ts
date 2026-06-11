import { describe, it, expect } from "vitest";
import { buildSteamLoginUrl, extractSteamId, verifyAssertion } from "./steam-openid";

describe("steam openid", () => {
  it("builds a checkid_setup url with our realm/return_to", () => {
    const url = new URL(buildSteamLoginUrl("https://wiki.test", "https://wiki.test/api/auth/steam/callback"));
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.realm")).toBe("https://wiki.test");
    expect(url.searchParams.get("openid.return_to")).toBe("https://wiki.test/api/auth/steam/callback");
  });

  it("extracts a 17-digit steamid from a claimed_id", () => {
    expect(extractSteamId("https://steamcommunity.com/openid/id/76561198000000000")).toBe("76561198000000000");
  });

  it("rejects a non-steam claimed_id", () => {
    expect(extractSteamId("https://evil.test/openid/id/76561198000000000")).toBeNull();
    expect(extractSteamId("https://steamcommunity.com/openid/id/notanumber")).toBeNull();
  });

  it("returns the steamid when Steam validates the assertion", async () => {
    const params = new URLSearchParams({
      "openid.mode": "id_res",
      "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000",
    });
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("openid.mode")).toBe("check_authentication");
      return { text: async () => "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n" } as Response;
    };
    expect(await verifyAssertion(params, fakeFetch as typeof fetch)).toBe("76561198000000000");
  });

  it("returns null when Steam says is_valid:false", async () => {
    const params = new URLSearchParams({ "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000" });
    const fakeFetch = async () => ({ text: async () => "is_valid:false\n" } as Response);
    expect(await verifyAssertion(params, fakeFetch as typeof fetch)).toBeNull();
  });
});

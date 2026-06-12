const STEAM_OPENID = "https://steamcommunity.com/openid/login";

export function buildSteamLoginUrl(realm: string, returnTo: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function extractSteamId(claimedId: string | null): string | null {
  if (!claimedId) return null;
  const m = CLAIMED_ID_RE.exec(claimedId);
  return m ? m[1] : null;
}

/** Verify the callback assertion by echoing the params back to Steam with
 *  mode=check_authentication. Returns the verified steamid, or null. */
export async function verifyAssertion(
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const body = new URLSearchParams(params);
  body.set("openid.mode", "check_authentication");
  const res = await fetchImpl(STEAM_OPENID, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!/^is_valid:true$/m.test(text)) return null;
  // Defense-in-depth: only trust claimed_id/identity if they were actually
  // covered by the signature (listed in openid.signed). check_authentication
  // only re-verifies the signed subset, so an unsigned field is not trustworthy.
  const signed = (params.get("openid.signed") ?? "").split(",");
  if (!signed.includes("claimed_id") || !signed.includes("identity")) return null;
  return extractSteamId(params.get("openid.claimed_id"));
}

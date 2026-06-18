/** Public Steam community profile URL for a 17-digit steamId. */
export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

/** Display name for a contributor credit. SteamUser.personaName is nullable,
 *  so fall back to a neutral label; the profile link still resolves via steamId. */
export function editorDisplayName(personaName: string | null): string {
  return personaName?.trim() || "Anonymous contributor";
}

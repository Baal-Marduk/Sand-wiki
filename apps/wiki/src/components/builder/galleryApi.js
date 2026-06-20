// Build sharing is a fast-follow: it will wire into the wiki's Steam-auth backend
// (a Prisma Build model + a server action with moderation). Stubbed for the first
// builder drop, the "Publish to gallery" action surfaces this message until then.
export async function submitBuild() {
  throw new Error("Publishing builds isn't available yet. Coming in a follow-up.");
}

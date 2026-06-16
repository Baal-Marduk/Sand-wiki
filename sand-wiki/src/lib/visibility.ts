import type { Prisma } from "@prisma/client";

/** WHERE fragment to merge into Entity queries so disabled rows stay hidden from
 *  the public. Admins (isAdmin=true) get an empty fragment → they see everything.
 *  Defaulting callers to `false` keeps any forgotten call site safe (public view). */
export function visibilityWhere(isAdmin: boolean): Prisma.EntityWhereInput {
  return isAdmin ? {} : { disabled: false };
}

/** WHERE fragment for an EntityLink relation-include so a disabled entity is
 *  scrubbed from every cross-reference (loot tables, build costs, key panels,
 *  tech costs, `[[slug]]` description links, …). Keeps name-only links (no
 *  target) and links to enabled entities; drops links pointing at a disabled
 *  one. Unlike `visibilityWhere`, this is universal — disabled cross-refs are
 *  hidden from admins too, since admins manage disabled entities via browse
 *  lists and their own detail pages, not via stale references elsewhere. */
export const linkTargetEnabled: Prisma.EntityLinkWhereInput = {
  OR: [{ targetId: null }, { target: { disabled: false } }],
};

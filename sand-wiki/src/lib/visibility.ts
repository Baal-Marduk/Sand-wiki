import type { Prisma } from "@prisma/client";

/** WHERE fragment to merge into Entity queries so disabled rows stay hidden from
 *  the public. Admins (isAdmin=true) get an empty fragment → they see everything.
 *  Defaulting callers to `false` keeps any forgotten call site safe (public view). */
export function visibilityWhere(isAdmin: boolean): Prisma.EntityWhereInput {
  return isAdmin ? {} : { disabled: false };
}

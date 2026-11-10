import type { CardInstance, ID, Member, Role, Scope } from "./types";

/**
 * Authorization rules. These mirror the Postgres RLS policies in supabase/migrations
 * (and are enforced by the local demo store, which has no database to enforce them).
 */
export const roleIn = (members: Member[], groupId: ID | null, userId: ID): Role | null =>
  groupId ? (members.find((m) => m.groupId === groupId && m.userId === userId)?.role ?? null) : null;

export const canEditRole = (r: Role | null) => r === "owner" || r === "editor";

export function canViewCard(inst: CardInstance, me: ID, members: Member[]): boolean {
  if (inst.ownerId === me && (!inst.groupId || roleIn(members, inst.groupId, me))) return true;
  if (inst.groupId) return roleIn(members, inst.groupId, me) !== null;
  return false;
}

/** Edit content, schedule, blocks, responsibilities, sharing settings. */
export function canEditCard(inst: CardInstance, me: ID, members: Member[]): boolean {
  if (!inst.groupId) return inst.ownerId === me;
  return canEditRole(roleIn(members, inst.groupId, me));
}

export const canDeleteCard = canEditCard;

/** Only the card's creator may change who it is shared with, and only into groups where they can edit. */
export function canShareCard(inst: CardInstance, me: ID, targetGroupId: ID | null, members: Member[]): boolean {
  if (inst.ownerId !== me) return false;
  if (inst.groupId && !canEditRole(roleIn(members, inst.groupId, me))) return false;
  if (targetGroupId === null) return true; // unsharing own card
  return canEditRole(roleIn(members, targetGroupId, me));
}

/** Which progress scope applies for this viewer. */
export function scopeFor(inst: Pick<CardInstance, "groupId" | "completionMode">, me: ID): Scope {
  return inst.groupId && inst.completionMode === "together" ? "shared" : me;
}

export function canUpdateProgress(inst: CardInstance, me: ID, scope: Scope, members: Member[]): boolean {
  if (!inst.groupId) return inst.ownerId === me && scope === me;
  const role = roleIn(members, inst.groupId, me);
  if (!role) return false;
  if (inst.completionMode === "together") return scope === "shared" && canEditRole(role);
  return scope === me; // everyone (including viewers) may update their own progress
}

export const canManageGroup = (r: Role | null) => r === "owner";
export const canInvite = canManageGroup;

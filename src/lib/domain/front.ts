import type { CardSpec, ID, Member, Profile, Workspace } from "./types";

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

/**
 * The front's descriptive text: the optional context (project, route, book…) followed by the summary.
 * Anything that only repeats the title, or something already shown in the metadata line (time, progress), is dropped.
 */
export function frontText(spec: Pick<CardSpec, "title" | "context">, summary: string, alsoShown: string[] = []): { context: string; summary: string } {
  const title = norm(spec.title);
  const seen = alsoShown.map(norm).filter(Boolean);
  const keep = (t: string | undefined) => {
    const n = norm(t ?? "");
    if (!n) return "";
    if (n === title || (title && n.length > 3 && title.includes(n))) return "";
    if (seen.includes(n)) return "";
    return (t ?? "").trim();
  };
  const context = keep(spec.context);
  let sum = keep(summary);
  if (sum && context && norm(sum) === norm(context)) sum = "";
  return { context, summary: sum };
}

export interface PeopleLine {
  group: string;
  /** Chosen responsibility, e.g. "cooking" */
  duty?: string;
  /** Person doing it, if assigned to a current member. */
  person?: { name: string; initials: string };
  /** Plain-text version: "Family · Maja cooking" / "Family · cooking unassigned" / "Family" */
  text: string;
}

export const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
};

/**
 * Who a shared card is about. Shows the group name; adds one person only when the card's owner explicitly chose a
 * responsibility. Unassigned responsibilities and members who have left read as "unassigned" — never as a guess.
 */
export function peopleLine(
  spec: CardSpec,
  groupId: ID | null,
  ctx: { groups: Workspace["groups"]; members: Member[]; profiles: Profile[] },
): PeopleLine | null {
  if (!groupId || spec.front.showPeople === false) return null;
  const group = ctx.groups.find((g) => g.id === groupId);
  if (!group) return null;
  const pick = spec.front.personAssignmentId;
  const a = pick ? spec.blocks.flatMap((b) => (b.type === "responsibility" ? b.assignments : [])).find((x) => x.id === pick) : undefined;
  if (!a) return { group: group.name, text: group.name };
  const duty = a.label.trim().toLowerCase() || "responsible";
  const member = a.userId ? ctx.members.find((m) => m.groupId === groupId && m.userId === a.userId) : undefined;
  const profile = member ? ctx.profiles.find((p) => p.id === member.userId) : undefined;
  if (!profile) return { group: group.name, duty, text: `${group.name} · ${duty} unassigned` };
  return { group: group.name, duty, person: { name: profile.name, initials: initialsOf(profile.name) }, text: `${group.name} · ${profile.name} ${duty}` };
}

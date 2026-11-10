import { compareTimes } from "./dates";
import { scopeFor, canEditCard, canUpdateProgress } from "./permissions";
import { cardProgress, emptyState, type CardProgress } from "./progress";
import type {
  CardInstance,
  DayData,
  Density,
  ID,
  Member,
  Placement,
  ProgressRecord,
  ProgressState,
  Section,
  TimeStr,
} from "./types";

export interface DayCard {
  instance: CardInstance;
  placement: Placement;
  /** My progress scope's state (shared for "together", my own otherwise). */
  state: ProgressState;
  progress: CardProgress;
  density: Density;
  canEdit: boolean;
  canProgress: boolean;
  /** Other members' completion for "each person completes" cards. */
  others: { userId: ID; complete: boolean }[];
}
export interface DaySectionView {
  section: Section | null;
  cards: DayCard[];
}
export interface DayView {
  sections: DaySectionView[];
  hidden: DayCard[];
  skipped: DayCard[];
  summary: { done: number; total: number };
}

/** The section a timed card naturally belongs in (latest section starting at/before the time). */
export function autoSection(time: TimeStr | undefined, sections: Section[]): ID | null {
  const timed = sections.filter((s) => s.from).sort((a, b) => a.from!.localeCompare(b.from!));
  if (!time || timed.length === 0) return null;
  let pick = timed[0];
  for (const s of timed) if (s.from! <= time) pick = s;
  return pick.id;
}

/** Insert a card into an ordered list: after all cards at/before its time, before later-timed ones; untimed go last. */
export function insertByTime<T extends { time?: TimeStr }>(list: T[], item: T): T[] {
  const out = [...list];
  let idx = out.length;
  if (item.time) {
    const later = out.findIndex((x) => x.time && x.time > item.time!);
    if (later >= 0) idx = later;
  }
  out.splice(idx, 0, item);
  return out;
}

/**
 * Create placements for instances that don't have one yet for this user. Existing placements are left alone,
 * so nobody's arrangement is rearranged by someone else's changes. Returns only new/changed placements.
 */
export function planPlacements(args: {
  me: ID;
  instances: CardInstance[];
  placements: Placement[];
  sections: Section[];
  preferredSection?: (i: CardInstance) => ID | null | undefined;
}): Placement[] {
  const { me, instances, sections } = args;
  const sectionIds = new Set(sections.map((s) => s.id));
  const have = new Set(args.placements.map((p) => p.instanceId));
  const unplaced = instances
    .filter((i) => !have.has(i.id))
    .sort((a, b) => compareTimes(a.spec.time, b.spec.time) || a.spec.title.localeCompare(b.spec.title));
  if (unplaced.length === 0) return [];
  const byId = new Map(instances.map((i) => [i.id, i]));
  const lists = new Map<ID | null, { id: ID; time?: TimeStr }[]>();
  const keyOf = (s: ID | null) => s;
  for (const p of [...args.placements].sort((a, b) => a.position - b.position)) {
    const inst = byId.get(p.instanceId);
    if (!inst) continue;
    const key = keyOf(p.sectionId && sectionIds.has(p.sectionId) ? p.sectionId : null);
    lists.set(key, [...(lists.get(key) ?? []), { id: p.instanceId, time: inst.spec.time }]);
  }
  const touched = new Set<ID | null>();
  const sectionOf = new Map<ID, ID | null>();
  for (const inst of unplaced) {
    const pref = args.preferredSection?.(inst);
    let sec: ID | null = pref === undefined ? autoSection(inst.spec.time, sections) : pref;
    if (sec && !sectionIds.has(sec)) sec = autoSection(inst.spec.time, sections);
    lists.set(sec, insertByTime(lists.get(sec) ?? [], { id: inst.id, time: inst.spec.time }));
    touched.add(sec);
    sectionOf.set(inst.id, sec);
  }
  const existing = new Map(args.placements.map((p) => [p.instanceId, p]));
  const out: Placement[] = [];
  for (const sec of touched) {
    (lists.get(sec) ?? []).forEach((x, position) => {
      const old = existing.get(x.id);
      if (old) {
        if (old.position !== position) out.push({ ...old, position });
      } else out.push({ instanceId: x.id, userId: me, sectionId: sec, position, hidden: false });
    });
  }
  return out;
}

export function buildDayView(args: {
  me: ID;
  data: DayData;
  sections: Section[];
  members: Member[];
  defaultDensity: Density;
}): DayView {
  const { me, data, sections, members } = args;
  const sectionIds = new Set(sections.map((s) => s.id));
  const recs = new Map<string, ProgressRecord>();
  data.progress.forEach((p) => recs.set(`${p.instanceId}|${p.scope}`, p));
  const placements = new Map(data.placements.map((p) => [p.instanceId, p]));

  const cards: DayCard[] = data.instances.map((instance) => {
    const scope = scopeFor(instance, me);
    const state = recs.get(`${instance.id}|${scope}`)?.state ?? emptyState();
    const placement: Placement = placements.get(instance.id) ?? {
      instanceId: instance.id,
      userId: me,
      sectionId: autoSection(instance.spec.time, sections),
      position: Number.MAX_SAFE_INTEGER,
      hidden: false,
    };
    const others =
      instance.groupId && instance.completionMode === "individual"
        ? members
            .filter((m) => m.groupId === instance.groupId && m.userId !== me)
            .map((m) => ({
              userId: m.userId,
              complete: cardProgress(instance.spec, recs.get(`${instance.id}|${m.userId}`)?.state ?? emptyState()).complete,
            }))
        : [];
    return {
      instance,
      placement: { ...placement, sectionId: placement.sectionId && sectionIds.has(placement.sectionId) ? placement.sectionId : null },
      state,
      progress: cardProgress(instance.spec, state),
      density: placement.density ?? instance.spec.density ?? args.defaultDensity,
      canEdit: canEditCard(instance, me, members),
      canProgress: canUpdateProgress(instance, me, scope, members),
      others,
    };
  });

  const cmp = (a: DayCard, b: DayCard) =>
    a.placement.position - b.placement.position ||
    compareTimes(a.instance.spec.time, b.instance.spec.time) ||
    a.instance.id.localeCompare(b.instance.id);

  const visible = cards.filter((c) => !c.placement.hidden && !c.instance.skipped);
  const groups: DaySectionView[] = [{ section: null, cards: visible.filter((c) => c.placement.sectionId === null).sort(cmp) }];
  for (const s of [...sections].sort((a, b) => a.position - b.position))
    groups.push({ section: s, cards: visible.filter((c) => c.placement.sectionId === s.id).sort(cmp) });

  const counted = cards.filter((c) => !c.instance.skipped && !c.placement.hidden);
  return {
    sections: groups,
    hidden: cards.filter((c) => c.placement.hidden && !c.instance.skipped).sort(cmp),
    skipped: cards.filter((c) => c.instance.skipped).sort(cmp),
    summary: { done: counted.filter((c) => c.progress.complete).length, total: counted.length },
  };
}

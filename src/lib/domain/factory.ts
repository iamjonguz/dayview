import type { Block, CardSpec, ChecklistBlock, ID, ProgressBlock, ResponsibilityBlock, NoteBlock } from "./types";

export const uid = (): ID =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

/** The first accent is the theme's own sage. Cards saved with the old default amber follow the theme accent too (see resolveAccent). */
export const ACCENTS = ["#ff9b82", "#f2c46d", "#8ec5f0", "#b7a6f0", "#f0a0c8", "#c9d97a", "#7fd1d1"];
/** Earlier default accents (amber, then sage). Cards still carrying one follow the theme / the activity's own colour. */
export const LEGACY_DEFAULT_ACCENTS = ["#e8a04c", "#b8cdaa"];
export const LEGACY_DEFAULT_ACCENT = LEGACY_DEFAULT_ACCENTS[0];
export const isLegacyAccent = (a: string) => !a || LEGACY_DEFAULT_ACCENTS.includes(a.toLowerCase());
export const resolveAccent = (a: string) => (isLegacyAccent(a) ? ACCENTS[0] : a);

export const newCardSpec = (over: Partial<CardSpec> = {}): CardSpec => ({
  title: "",
  summary: "",
  cover: { kind: "none" },
  accent: "", // "" = match the activity (see lib/ui/activity.ts)
  density: "comfortable",
  front: { showTime: true, showSummary: true, showProgress: true },
  completion: { mode: "manual" },
  blocks: [],
  ...over,
});

export const newBlock = {
  note: (title = "Notes", text = ""): NoteBlock => ({ id: uid(), type: "note", title, text }),
  checklist: (title = "Checklist", items: string[] = [], noun?: string): ChecklistBlock => ({
    id: uid(),
    type: "checklist",
    title,
    noun,
    items: items.map((text) => ({ id: uid(), text })),
  }),
  progress: (title = "Progress", target = 10, unit = "", step = 1): ProgressBlock => ({
    id: uid(),
    type: "progress",
    title,
    target,
    unit,
    step,
  }),
  responsibility: (title = "Who does what", labels: string[] = ["Cooking"]): ResponsibilityBlock => ({
    id: uid(),
    type: "responsibility",
    title,
    assignments: labels.map((label) => ({ id: uid(), label, userId: null })),
  }),
};

export function addBlock(type: Block["type"]): Block {
  switch (type) {
    case "note":
      return newBlock.note();
    case "checklist":
      return newBlock.checklist("Checklist", [""]);
    case "progress":
      return newBlock.progress();
    case "responsibility":
      return newBlock.responsibility();
  }
}

/** Deep-copy a spec with brand-new block/item IDs (used when creating from templates, duplicating, saving as template). */
export function cloneSpec(spec: CardSpec, freshIds = true): CardSpec {
  const idMap = new Map<string, string>();
  const nid = (old: string) => {
    if (!freshIds) return old;
    const n = uid();
    idMap.set(old, n);
    return n;
  };
  const blocks: Block[] = spec.blocks.map((b) => {
    const id = nid(b.id);
    if (b.type === "checklist") return { ...b, id, items: b.items.map((i) => ({ ...i, id: nid(i.id) })) };
    if (b.type === "responsibility") return { ...b, id, assignments: b.assignments.map((a) => ({ ...a, id: nid(a.id) })) };
    return { ...b, id };
  });
  const summarySource =
    spec.summarySource && spec.summarySource.kind !== "text"
      ? { ...spec.summarySource, blockId: idMap.get(spec.summarySource.blockId) ?? spec.summarySource.blockId }
      : spec.summarySource;
  const completion =
    spec.completion.mode === "derived"
      ? { mode: "derived" as const, blockIds: spec.completion.blockIds.map((i) => idMap.get(i) ?? i) }
      : spec.completion;
  const front = { ...spec.front };
  if (front.personAssignmentId) front.personAssignmentId = idMap.get(front.personAssignmentId) ?? front.personAssignmentId;
  if (front.progressBlockIds) front.progressBlockIds = front.progressBlockIds.map((i) => idMap.get(i) ?? i);
  return { ...spec, summarySource, cover: { ...spec.cover }, focus: spec.focus ? { ...spec.focus } : undefined, front, completion, blocks };
}

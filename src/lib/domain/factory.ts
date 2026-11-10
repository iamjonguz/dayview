import type { Block, CardSpec, ChecklistBlock, ID, ProgressBlock, ResponsibilityBlock, NoteBlock } from "./types";

export const uid = (): ID =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const ACCENTS = ["#e8a04c", "#d9775a", "#c9a227", "#7fa876", "#6fa3a8", "#8f8bd0", "#c47fa6"];

export const newCardSpec = (over: Partial<CardSpec> = {}): CardSpec => ({
  title: "",
  summary: "",
  cover: { kind: "none" },
  accent: ACCENTS[0],
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
  const completion =
    spec.completion.mode === "derived"
      ? { mode: "derived" as const, blockIds: spec.completion.blockIds.map((i) => idMap.get(i) ?? i) }
      : spec.completion;
  return { ...spec, cover: { ...spec.cover }, front: { ...spec.front }, completion, blocks };
}

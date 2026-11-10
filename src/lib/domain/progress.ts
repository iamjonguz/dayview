import type { Block, CardSpec, ChecklistBlock, ProgressBlock, ProgressState } from "./types";

/**
 * Progress rules (shown to users in the editor):
 *  - Checklists count checked items. Empty checklists are never complete.
 *  - Numeric targets count value / target and are clamped to 100% for visuals.
 *  - Notes and responsibilities never count towards progress.
 *  - "Manual" cards are complete only when the person marks them done.
 *  - "Derived" cards are complete when every selected tracking block is complete;
 *    with no valid selected blocks they are never complete (notes-only cards are never auto-completed).
 */

export type TrackingBlock = ChecklistBlock | ProgressBlock;
export const isTracking = (b: Block): b is TrackingBlock => b.type === "checklist" || b.type === "progress";
export const trackingBlocks = (spec: CardSpec): TrackingBlock[] => spec.blocks.filter(isTracking);

export const emptyState = (): ProgressState => ({ completed: false, checks: {}, values: {} });

export function blockFraction(block: TrackingBlock, state: ProgressState): number {
  if (block.type === "checklist") {
    if (block.items.length === 0) return 0;
    const done = block.items.filter((i) => state.checks[i.id]).length;
    return done / block.items.length;
  }
  if (!(block.target > 0)) return 0;
  const v = Math.max(0, state.values[block.id] ?? 0);
  return Math.min(1, v / block.target);
}

export const blockComplete = (block: TrackingBlock, state: ProgressState) => blockFraction(block, state) >= 1;

/** Blocks that drive the front progress bar / derived completion. */
export function relevantBlocks(spec: CardSpec): TrackingBlock[] {
  const all = trackingBlocks(spec);
  if (spec.completion.mode === "derived") {
    const ids = new Set(spec.completion.blockIds);
    return all.filter((b) => ids.has(b.id));
  }
  return all;
}

export interface CardProgress {
  hasTracking: boolean;
  /** 0..1, never above 1. */
  fraction: number;
  complete: boolean;
  /** Short human label like "2 of 5 tasks" or "20 of 30 min". Empty if nothing to track. */
  label: string;
}

export function cardProgress(spec: CardSpec, state: ProgressState): CardProgress {
  const blocks = relevantBlocks(spec);
  const derived = spec.completion.mode === "derived";
  const complete = derived ? blocks.length > 0 && blocks.every((b) => blockComplete(b, state)) : state.completed;
  if (blocks.length === 0) return { hasTracking: false, fraction: 0, complete, label: "" };
  const fraction = Math.min(1, blocks.reduce((s, b) => s + blockFraction(b, state), 0) / blocks.length);
  let label: string;
  if (blocks.length === 1) {
    const b = blocks[0];
    if (b.type === "checklist") {
      const done = b.items.filter((i) => state.checks[i.id]).length;
      label = `${done} of ${b.items.length} ${b.noun || (b.items.length === 1 ? "item" : "items")}`;
    } else {
      label = `${fmtNum(state.values[b.id] ?? 0)} of ${fmtNum(b.target)}${b.unit ? ` ${b.unit}` : ""}`;
    }
  } else {
    const done = blocks.filter((b) => blockComplete(b, state)).length;
    label = `${done} of ${blocks.length} parts`;
  }
  return { hasTracking: true, fraction, complete, label };
}

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Remove state that points at blocks/items that no longer exist (keeps old values for matching ids). */
export function pruneState(spec: CardSpec, state: ProgressState): ProgressState {
  const itemIds = new Set<string>();
  const progressIds = new Set<string>();
  for (const b of spec.blocks) {
    if (b.type === "checklist") b.items.forEach((i) => itemIds.add(i.id));
    if (b.type === "progress") progressIds.add(b.id);
  }
  return {
    completed: state.completed,
    checks: Object.fromEntries(Object.entries(state.checks).filter(([k]) => itemIds.has(k))),
    values: Object.fromEntries(Object.entries(state.values).filter(([k]) => progressIds.has(k))),
  };
}

export const hasAnyState = (s: ProgressState) =>
  s.completed || Object.values(s.checks).some(Boolean) || Object.values(s.values).some((v) => v > 0);

/** The one-line summary shown on the card front: the user's text, the next unchecked item, or a block's progress. */
export function resolveSummary(spec: CardSpec, state: ProgressState): string {
  const src = spec.summarySource;
  if (!src || src.kind === "text") return spec.summary;
  const b = spec.blocks.find((x) => x.id === src.blockId);
  if (!b) return spec.summary;
  if (src.kind === "next-item" && b.type === "checklist") {
    const next = b.items.find((i) => i.text.trim() && !state.checks[i.id]);
    if (next) return `Next: ${next.text}`;
    return b.items.length ? `All ${b.noun || "items"} ticked` : spec.summary;
  }
  if (src.kind === "progress" && b.type === "progress")
    return `${fmtNum(state.values[b.id] ?? 0)} of ${fmtNum(b.target)}${b.unit ? ` ${b.unit}` : ""}`;
  return spec.summary;
}

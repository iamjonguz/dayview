import { describe, expect, it } from "vitest";
import { newBlock, newCardSpec } from "../src/lib/domain/factory";
import { cardProgress, emptyState } from "../src/lib/domain/progress";

describe("progress rules", () => {
  it("notes-only cards are never auto-completed", () => {
    const spec = newCardSpec({ blocks: [newBlock.note("n", "text")], completion: { mode: "derived", blockIds: [] } });
    const p = cardProgress(spec, emptyState());
    expect(p.complete).toBe(false);
    expect(p.hasTracking).toBe(false);
    expect(p.label).toBe("");
  });

  it("manual completion is independent of tracking blocks", () => {
    const cl = newBlock.checklist("c", ["a", "b"]);
    const spec = newCardSpec({ blocks: [cl] });
    const done = { ...emptyState(), checks: Object.fromEntries(cl.items.map((i) => [i.id, true])) };
    expect(cardProgress(spec, done).complete).toBe(false);
    expect(cardProgress(spec, { ...done, completed: true }).complete).toBe(true);
  });

  it("derived completion requires every selected block", () => {
    const cl = newBlock.checklist("c", ["a", "b"]);
    const pr = newBlock.progress("p", 30, "min", 5);
    const spec = newCardSpec({ blocks: [cl, pr], completion: { mode: "derived", blockIds: [cl.id, pr.id] } });
    let st = { ...emptyState(), checks: { [cl.items[0].id]: true, [cl.items[1].id]: true } };
    expect(cardProgress(spec, st).complete).toBe(false);
    st = { ...st, values: { [pr.id]: 30 } };
    expect(cardProgress(spec, st).complete).toBe(true);
    expect(cardProgress(spec, st).label).toBe("2 of 2 parts");
  });

  it("numeric progress is clamped to 100% for visuals but the label keeps the real value", () => {
    const pr = newBlock.progress("p", 20, "pages", 5);
    const spec = newCardSpec({ blocks: [pr], completion: { mode: "derived", blockIds: [pr.id] } });
    const over = cardProgress(spec, { ...emptyState(), values: { [pr.id]: 35 } });
    expect(over.fraction).toBe(1);
    expect(over.complete).toBe(true);
    expect(over.label).toBe("35 of 20 pages");
    expect(cardProgress(spec, { ...emptyState(), values: { [pr.id]: -4 } }).fraction).toBe(0);
  });

  it("empty checklists and zero targets are never complete", () => {
    const cl = newBlock.checklist("c", []);
    const pr = newBlock.progress("p", 0, "x");
    for (const b of [cl, pr]) {
      const spec = newCardSpec({ blocks: [b], completion: { mode: "derived", blockIds: [b.id] } });
      expect(cardProgress(spec, emptyState()).complete).toBe(false);
    }
  });

  it("ignores state for items that were removed", () => {
    const cl = newBlock.checklist("c", ["a", "b"]);
    const spec = newCardSpec({ blocks: [cl] });
    const p = cardProgress(spec, { ...emptyState(), checks: { [cl.items[0].id]: true, ghost: true } });
    expect(p.fraction).toBe(0.5);
    expect(p.label).toBe("1 of 2 items");
  });
});

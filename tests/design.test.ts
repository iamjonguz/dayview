import { describe, expect, it } from "vitest";
import { buildDayView } from "../src/lib/domain/dayview";
import { ACCENTS, cloneSpec, newBlock, newCardSpec, resolveAccent } from "../src/lib/domain/factory";
import { emptyState, resolveSummary } from "../src/lib/domain/progress";
import type { CardInstance, Placement } from "../src/lib/domain/types";

describe("front-of-card summary", () => {
  const cl = newBlock.checklist("Tasks", ["Review inbox", "Finish proposal", "Plan tomorrow"], "tasks");
  const pr = newBlock.progress("Pages", 20, "pages", 5);
  const base = newCardSpec({ title: "Work", summary: "Focus time", blocks: [cl, pr] });

  it("defaults to the text the user wrote — an incidental checklist never takes over", () => {
    expect(resolveSummary(base, emptyState())).toBe("Focus time");
  });
  it("can show the next unchecked item", () => {
    const spec = { ...base, summarySource: { kind: "next-item" as const, blockId: cl.id } };
    expect(resolveSummary(spec, emptyState())).toBe("Next: Review inbox");
    const st = { ...emptyState(), checks: { [cl.items[0].id]: true } };
    expect(resolveSummary(spec, st)).toBe("Next: Finish proposal");
    const all = { ...emptyState(), checks: Object.fromEntries(cl.items.map((i) => [i.id, true])) };
    expect(resolveSummary(spec, all)).toBe("All tasks ticked");
  });
  it("can show a numeric block's progress, even past the target", () => {
    const spec = { ...base, summarySource: { kind: "progress" as const, blockId: pr.id } };
    expect(resolveSummary(spec, { ...emptyState(), values: { [pr.id]: 12 } })).toBe("12 of 20 pages");
    expect(resolveSummary(spec, { ...emptyState(), values: { [pr.id]: 25 } })).toBe("25 of 20 pages");
  });
  it("falls back to the written text when the source block is gone, and survives cloning", () => {
    expect(resolveSummary({ ...base, summarySource: { kind: "next-item", blockId: "gone" } }, emptyState())).toBe("Focus time");
    const copy = cloneSpec({ ...base, summarySource: { kind: "next-item", blockId: cl.id } });
    const newId = copy.blocks[0].id;
    expect(newId).not.toBe(cl.id);
    expect(copy.summarySource).toEqual({ kind: "next-item", blockId: newId });
  });
});

describe("card size preference", () => {
  const inst = (density: "compact" | "comfortable"): CardInstance => ({
    id: "i", ownerId: "me", groupId: null, seriesId: null, date: "2026-11-10", spec: newCardSpec({ title: "A", density }),
    completionMode: "together", skipped: false, rev: 1, updatedAt: "", updatedBy: "me",
  });
  const view = (i: CardInstance, defaultDensity: "compact" | "comfortable", placement?: Placement) =>
    buildDayView({ me: "me", data: { instances: [i], progress: [], placements: placement ? [placement] : [] }, sections: [], members: [], defaultDensity }).sections[0].cards[0].density;

  it("follows the person's day-view preference", () => {
    expect(view(inst("comfortable"), "compact")).toBe("compact");
    expect(view(inst("comfortable"), "comfortable")).toBe("comfortable");
  });
  it("a card set to always-compact stays compact; a per-card personal choice wins over both", () => {
    expect(view(inst("compact"), "comfortable")).toBe("compact");
    const p: Placement = { instanceId: "i", userId: "me", sectionId: null, position: 0, hidden: false, density: "comfortable" };
    expect(view(inst("compact"), "compact", p)).toBe("comfortable");
  });
});

describe("accent colours", () => {
  it("cards saved with the old default amber follow the theme accent; deliberate colours are kept", () => {
    expect(resolveAccent("#e8a04c")).toBe(ACCENTS[0]);
    expect(resolveAccent("#E8A04C")).toBe(ACCENTS[0]);
    expect(resolveAccent("#8fb8c9")).toBe("#8fb8c9");
    expect(resolveAccent("#b8cdaa")).toBe(ACCENTS[0]); // the previous sage default also follows the theme
    expect(resolveAccent("")).toBe(ACCENTS[0]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cloneSpec, newBlock, newCardSpec } from "../src/lib/domain/factory";
import { cardProgress, emptyState, frontBlocks } from "../src/lib/domain/progress";
import { starterTemplates } from "../src/lib/domain/starters";
import { activityIconKey, activityStyle } from "../src/lib/ui/activity";
import { ACCENTS } from "../src/lib/domain/factory";
import { dayHref } from "../src/lib/ui/links";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const token = (n: string) => css.match(new RegExp(`--color-${n}:\\s*(#[0-9a-f]{6})`, "i"))![1];
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("design tokens: contrast (WCAG AA, 4.5:1 for text)", () => {
  const pairs: [string, string, number][] = [
    ["fg", "bg", 4.5], ["fg", "surface", 4.5], ["muted", "bg", 4.5], ["muted", "surface", 4.5], ["muted", "surface-2", 4.5], ["fg", "surface-2", 4.5],
    ["accent-ink", "accent", 4.5], ["done-ink", "done", 4.5], ["accent", "surface", 4.5], ["accent", "bg", 4.5], ["done", "surface", 4.5],
    ["danger", "surface", 4.5], ["focus", "surface", 3], ["focus", "bg", 3], ["line", "bg", 1.3],
  ];
  it.each(pairs)("%s on %s ≥ %s", (fg, bg, min) => expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(min));
  it("keeps cards visibly lifted from the background", () => expect(ratio(token("surface"), token("bg"))).toBeGreaterThan(1.15));
  it("coral selection and mint completion are different hues", () => expect(token("accent")).not.toBe(token("done")));
});

describe("front-of-card progress selection", () => {
  const ing = newBlock.checklist("Ingredients", ["Salmon", "Rice"], "ingredients");
  const steps = newBlock.checklist("Steps", ["Chop", "Cook"], "steps");
  const spec = newCardSpec({ title: "Dinner", blocks: [ing, steps] });
  const state = { ...emptyState(), checks: { [ing.items[0].id]: true, [ing.items[1].id]: true } };

  it("by default the front shows what the completion rule counts", () => {
    expect(frontBlocks(spec).map((b) => b.id)).toEqual([ing.id, steps.id]);
    expect(cardProgress(spec, state).front.label).toBe("1 of 2 parts");
  });
  it("can show only chosen blocks without changing completion", () => {
    const picked = { ...spec, front: { ...spec.front, progressBlockIds: [ing.id] } };
    const p = cardProgress(picked, state);
    expect(p.front.label).toBe("2 of 2 ingredients");
    expect(p.front.fraction).toBe(1);
    expect(p.complete).toBe(false); // manual: ingredient readiness never completes dinner
    expect(p.label).toBe("1 of 2 parts"); // the card's own progress is unchanged
  });
  it("derived completion ignores the front choice", () => {
    const d = { ...spec, completion: { mode: "derived" as const, blockIds: [ing.id, steps.id] }, front: { ...spec.front, progressBlockIds: [ing.id] } };
    expect(cardProgress(d, state).complete).toBe(false);
  });
  it("an empty choice hides front progress; cloning remaps the chosen block ids", () => {
    expect(cardProgress({ ...spec, front: { ...spec.front, progressBlockIds: [] } }, state).front.has).toBe(false);
    const copy = cloneSpec({ ...spec, front: { ...spec.front, progressBlockIds: [ing.id] } });
    expect(copy.front.progressBlockIds).toEqual([copy.blocks[0].id]);
    expect(copy.blocks[0].id).not.toBe(ing.id);
  });
});

describe("dinner starter hierarchy", () => {
  it("leads with the plan and keeps ingredients last", () => {
    const d = starterTemplates().find((t) => t.id === "starter-dinner")!.spec;
    expect(d.blocks.map((b) => (b.type === "note" ? b.title : b.type))).toEqual(["Tonight’s plan", "Preparation", "checklist"]);
    expect(d.completion.mode).toBe("manual");
  });
});

describe("activity identity", () => {
  it("infers a recognisable icon from the title, with a fallback", () => {
    expect(activityIconKey({ title: "Dinner" })).toBe("meal");
    expect(activityIconKey({ title: "Reading" })).toBe("reading");
    expect(activityIconKey({ title: "Xyzzy" })).toBe("other");
    expect(activityIconKey({ title: "Dinner", icon: "work" })).toBe("work");
  });
  it("old default accents take the activity colour; deliberate colours are kept", () => {
    expect(activityStyle({ title: "Work", accent: "#b8cdaa" }).color).toBe("#8ec5f0");
    expect(activityStyle({ title: "Work", accent: "" }).color).toBe("#8ec5f0");
    expect(activityStyle({ title: "Work", accent: ACCENTS[3] }).color).toBe(ACCENTS[3]);
  });
});

describe("activity links", () => {
  it("encodes the date and the stable instance id", () => {
    expect(dayHref("2026-11-10")).toBe("/?date=2026-11-10");
    expect(dayHref("2026-11-10", "abc-123")).toBe("/?date=2026-11-10&card=abc-123");
  });
});

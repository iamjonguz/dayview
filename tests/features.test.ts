import { describe, expect, it } from "vitest";
import { addDays } from "../src/lib/domain/dates";
import { checklistCard, DEMO_FAMILY, makeEnv, TODAY } from "./helpers";

const Y = addDays(TODAY, -1);
const manual = (t: string) => ({ ...checklistCard(t).spec, completion: { mode: "manual" as const } });

describe("move / copy to another day", () => {
  it("moves a one-off in place", async () => {
    const p = await makeEnv().as("demo-you");
    const c = (await p.createCard({ date: TODAY, spec: manual("Errand") }))!;
    await p.moveCardToDate(c, addDays(TODAY, 3));
    expect((await p.loadDay(TODAY)).instances).toHaveLength(0);
    expect((await p.loadDay(addDays(TODAY, 3))).instances.map((i) => i.id)).toEqual([c.id]);
  });
  it("moving a routine day skips it and creates a one-off, without duplicates or ending the routine", async () => {
    const p = await makeEnv().as("demo-you");
    await p.createCard({ date: TODAY, spec: manual("Run"), recurrence: { kind: "daily", weekdays: [] } });
    const inst = (await p.loadDay(TODAY)).instances[0];
    await p.moveCardToDate(inst, addDays(TODAY, 2));
    const today = (await p.loadDay(TODAY)).instances;
    expect(today).toHaveLength(1);
    expect(today[0].skipped).toBe(true);
    const later = (await p.loadDay(addDays(TODAY, 2))).instances;
    expect(later).toHaveLength(2); // the routine's own day + the moved one-off
    expect(later.filter((i) => i.seriesId === null)).toHaveLength(1);
    expect((await p.loadDay(addDays(TODAY, 1))).instances).toHaveLength(1);
  });
  it("copy is independent and personal; shared cards move for everyone but only editors may", async () => {
    const env = makeEnv();
    const me = await env.as("demo-you");
    const shared = (await me.createCard({ date: TODAY, spec: manual("Dinner"), groupId: DEMO_FAMILY }))!;
    const copy = await me.copyCardToDate(shared, addDays(TODAY, 1));
    expect(copy.groupId).toBeNull();
    const erik = await env.as("demo-erik");
    await expect(erik.moveCardToDate(shared, addDays(TODAY, 5))).rejects.toThrow();
    await me.moveCardToDate(shared, addDays(TODAY, 5));
    expect((await (await env.as("demo-maja")).repo.loadDay(addDays(TODAY, 5))).instances.map((i) => i.id)).toContain(shared.id);
  });
});

describe("carry-over", () => {
  it("offers only my unfinished one-offs; skips routines, shared, done and skipped cards", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    const open = (await p.createCard({ date: Y, spec: manual("Open") }))!;
    const done = (await p.createCard({ date: Y, spec: manual("Done") }))!;
    await p.patchProgress(done, { completed: true });
    await p.createCard({ date: Y, spec: manual("Shared"), groupId: DEMO_FAMILY });
    await p.createCard({ date: Y, spec: manual("Routine"), recurrence: { kind: "daily", weekdays: [] } });
    await p.loadDay(Y);
    const skipped = (await p.createCard({ date: Y, spec: manual("Skipped") }))!;
    await p.skipCard(skipped, true);
    expect((await p.unfinishedFrom(Y)).map((i) => i.id)).toEqual([open.id]);
    expect(await p.carryOver([open.id], Y, TODAY)).toBe(1);
    expect((await p.unfinishedFrom(Y))).toHaveLength(0);
    expect((await p.loadDay(TODAY)).instances.some((i) => i.id === open.id)).toBe(true);
  });
});

describe("search", () => {
  it("matches titles, notes and checklist items across days, newest first, only what I can see", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    await p.createCard({ date: Y, spec: manual("Buy Groceries") });
    await p.createCard({ date: addDays(TODAY, 2), spec: { ...manual("Plan"), summary: "groceries and more" } });
    expect((await p.search("grocer")).map((i) => i.date)).toEqual([addDays(TODAY, 2), Y]);
    expect(await p.search("g")).toEqual([]);
    expect(await (await env.as("demo-maja")).search("grocer")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { addDays, diffDays, todayIn, weekdayOf } from "../src/lib/domain/dates";
import { occursOn, occurrencesBetween } from "../src/lib/domain/recurrence";
import { checklistCard, makeEnv, TODAY } from "./helpers";

describe("date helpers", () => {
  it("does calendar arithmetic without DST drift", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29"); // Sweden DST change
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(diffDays("2026-11-10", "2026-11-03")).toBe(7);
    expect(weekdayOf("2026-11-10")).toBe(2); // Tuesday
  });
  it("derives today in the user's timezone, not the host's", () => {
    const late = new Date("2026-11-10T23:30:00Z");
    expect(todayIn("Europe/Stockholm", late)).toBe("2026-11-11");
    expect(todayIn("America/Los_Angeles", late)).toBe("2026-11-10");
  });
});

describe("recurrence rules", () => {
  const weekdays = { kind: "weekdays" as const, weekdays: [1, 3, 5], start: "2026-11-02", end: "2026-11-20" };
  it("respects weekdays, start and end", () => {
    expect(occurrencesBetween(weekdays, "2026-10-01", "2026-12-31")).toEqual([
      "2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13", "2026-11-16", "2026-11-18", "2026-11-20",
    ]);
    expect(occursOn(weekdays, "2026-11-01")).toBe(false);
    expect(occursOn(weekdays, "2026-11-21")).toBe(false);
  });
  it("daily without end is open-ended and has no duplicates", () => {
    const r = { kind: "daily" as const, weekdays: [], start: "2026-11-01" };
    const out = occurrencesBetween(r, "2026-11-01", "2026-11-30");
    expect(out).toHaveLength(30);
    expect(new Set(out).size).toBe(30);
  });
});

describe("materialisation", () => {
  it("never generates duplicate instances, even when loading repeatedly or concurrently", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    const { spec } = checklistCard();
    await p.createCard({ date: TODAY, spec, recurrence: { kind: "daily", weekdays: [] } });
    await Promise.all([p.loadDay(TODAY), p.loadDay(TODAY), p.loadDay(TODAY)]);
    await p.loadDay(TODAY);
    const day = await p.repo.loadDay(TODAY);
    expect(day.instances.filter((i) => i.spec.title === "Routine")).toHaveLength(1);
    // a second device/tab loading too
    const p2 = await env.as("demo-you");
    await p2.loadDay(TODAY);
    expect((await p2.repo.loadDay(TODAY)).instances).toHaveLength(1);
  });

  it("skipping an occurrence keeps the routine and does not regenerate that day", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    await p.createCard({ date: TODAY, spec: checklistCard().spec, recurrence: { kind: "daily", weekdays: [] } });
    const tomorrow = addDays(TODAY, 1);
    let day = await p.loadDay(tomorrow);
    expect(day.instances).toHaveLength(1);
    await p.skipCard(day.instances[0], true);
    day = await p.loadDay(tomorrow);
    expect(day.instances).toHaveLength(1);
    expect(day.instances[0].skipped).toBe(true);
    const view = p.view(day);
    expect(view.summary.total).toBe(0); // skipped is not counted, not a failure
    expect(view.skipped).toHaveLength(1);
    expect(p.ws.series).toHaveLength(1);
    // the day after is unaffected
    expect((await p.loadDay(addDays(TODAY, 2))).instances[0].skipped).toBe(false);
  });

  it("only produces cards on selected weekdays", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    await p.createCard({ date: TODAY, spec: checklistCard("Walk").spec, recurrence: { kind: "weekdays", weekdays: [2, 4] } });
    expect((await p.loadDay(TODAY)).instances).toHaveLength(1); // Tue
    expect((await p.loadDay("2026-11-11")).instances).toHaveLength(0); // Wed
    expect((await p.loadDay("2026-11-12")).instances).toHaveLength(1); // Thu
  });
});

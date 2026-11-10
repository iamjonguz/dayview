import { describe, expect, it } from "vitest";
import { addDays } from "../src/lib/domain/dates";
import { newBlock } from "../src/lib/domain/factory";
import { checklistCard, makeEnv, TODAY } from "./helpers";

describe("historical isolation", () => {
  it("editing 'this and future' never rewrites past days", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    const { spec, cl } = checklistCard("Morning", ["Water", "Stretch"]);
    const start = addDays(TODAY, -3);
    await p.createCard({ date: start, spec, recurrence: { kind: "daily", weekdays: [] } });
    for (let i = 0; i <= 3; i++) await p.loadDay(addDays(start, i));

    // complete a checklist item three days ago
    const old = (await p.repo.loadDay(start)).instances[0];
    await p.patchProgress(old, { checks: { [cl.items[0].id]: true }, completed: true });

    // edit from today onwards: new title + extra step
    const todayInst = (await p.repo.loadDay(TODAY)).instances[0];
    const newSpec = { ...todayInst.spec, title: "Morning v2", blocks: [{ ...cl, items: [...cl.items, { id: "x", text: "Journal" }] }] };
    await p.updateCard(todayInst, { spec: newSpec }, "future");

    const past = (await p.repo.loadRange(start, addDays(TODAY, -1))).instances;
    expect(past).toHaveLength(3);
    for (const i of past) {
      expect(i.spec.title).toBe("Morning");
      expect((i.spec.blocks[0] as typeof cl).items).toHaveLength(2);
    }
    const rec = (await p.repo.loadDay(start)).progress[0];
    expect(rec.state.completed).toBe(true);
    expect(rec.state.checks[cl.items[0].id]).toBe(true);

    // future days pick up the new content, exactly once each
    const f = await p.loadDay(addDays(TODAY, 2));
    expect(f.instances).toHaveLength(1);
    expect(f.instances[0].spec.title).toBe("Morning v2");
    // today keeps its (empty) state and the change; there is exactly one routine card today
    expect((await p.loadDay(TODAY)).instances).toHaveLength(1);
    expect(p.ws.series).toHaveLength(2);
  });

  it("'this day only' changes just that card", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    await p.createCard({ date: TODAY, spec: checklistCard("Walk").spec, recurrence: { kind: "daily", weekdays: [] } });
    const day = await p.loadDay(TODAY);
    await p.updateCard(day.instances[0], { spec: { ...day.instances[0].spec, title: "Long walk" } }, "this");
    expect((await p.loadDay(TODAY)).instances[0].spec.title).toBe("Long walk");
    expect((await p.loadDay(addDays(TODAY, 1))).instances[0].spec.title).toBe("Walk");
  });

  it("editing or deleting a saved template does not touch existing cards", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    const { spec } = checklistCard("From template");
    const t = await p.saveTemplate("Mine", spec);
    const card = (await p.createCard({ date: TODAY, spec: t.spec }))!;
    await p.saveTemplate("Mine", { ...t.spec, title: "Changed" }, t.id);
    await p.deleteTemplate(t.id);
    const day = await p.loadDay(TODAY);
    expect(day.instances.find((i) => i.id === card.id)!.spec.title).toBe("From template");
  });

  it("ending a routine keeps history but removes pristine future days", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    const start = addDays(TODAY, -2);
    await p.createCard({ date: start, spec: checklistCard("R").spec, recurrence: { kind: "daily", weekdays: [] } });
    for (let i = 0; i <= 4; i++) await p.loadDay(addDays(start, i));
    const series = p.ws.series[0];
    await p.endSeriesFrom(series, TODAY);
    const { instances } = await p.repo.loadRange(start, addDays(TODAY, 5));
    expect(instances.map((i) => i.date).sort()).toEqual([start, addDays(start, 1)]);
    expect((await p.loadDay(addDays(TODAY, 1))).instances).toHaveLength(0);
  });

  it("deleting a one-off removes it, deleting a routine day skips it", async () => {
    const env = makeEnv();
    const p = await env.as("demo-you");
    const one = (await p.createCard({ date: TODAY, spec: checklistCard("One").spec }))!;
    await p.deleteCard(one);
    expect((await p.loadDay(TODAY)).instances).toHaveLength(0);
    await p.createCard({ date: TODAY, spec: newBlockless(), recurrence: { kind: "daily", weekdays: [] } });
    const inst = (await p.loadDay(TODAY)).instances[0];
    await p.deleteCard(inst, "this");
    const after = (await p.loadDay(TODAY)).instances;
    expect(after).toHaveLength(1);
    expect(after[0].skipped).toBe(true);
  });
});

function newBlockless() {
  return { ...checklistCard("Series").spec, blocks: [newBlock.note("n", "x")], completion: { mode: "manual" as const } };
}

import { addDays, weekdayOf } from "../domain/dates";
import { newBlock, newCardSpec } from "../domain/factory";
import type { CardSpec, ID } from "../domain/types";
import { starterTemplates } from "../domain/starters";
import { DEMO_FAMILY } from "./local";
import type { Planner } from "./planner";

const tpl = (id: string): CardSpec => starterTemplates().find((t) => t.id === id)!.spec;

/** Seeds a realistic, editable day (and a little history) for the demo user. Everything is ordinary data. */
export async function seedDemo(p: Planner) {
  const today = p.today();
  const start = addDays(today, -10);
  const wd = weekdayOf(today);

  // --- routines
  const morning = tpl("starter-morning");
  const work = tpl("starter-work");
  const workList = newBlock.checklist("Tasks", ["Review inbox", "Team check-in", "Finish proposal", "Review designs", "Plan tomorrow"], "tasks");
  workList.id = work.blocks[0].id;
  const workSpec: CardSpec = {
    ...work,
    summary: "Focus time",
    blocks: [workList, newBlock.note("Notes", "Send the draft before **15:00**.")],
  };
  const lunchList = newBlock.checklist("Plate", ["Soup", "Sourdough", "Fruit"], "items");
  const lunch = newCardSpec({
    title: "Lunch",
    summary: "Soup & sourdough",
    time: "12:00",
    cover: { kind: "preset", id: "soup" },
    blocks: [lunchList],
  });
  const exercise = tpl("starter-exercise");
  const reading = tpl("starter-reading");
  const everyDay = { kind: "daily" as const, weekdays: [] };
  const sec = (name: string) => p.ws.sections.find((s) => s.name === name)?.id ?? null;

  await p.createCard({ date: start, spec: morning, recurrence: everyDay, sectionId: sec("Morning") });
  await p.createCard({ date: start, spec: workSpec, recurrence: { kind: "weekdays", weekdays: [1, 2, 3, 4, 5] }, sectionId: sec("Morning") });
  await p.createCard({ date: start, spec: lunch, recurrence: everyDay, sectionId: sec("Afternoon") });
  await p.createCard({ date: start, spec: exercise, recurrence: { kind: "weekdays", weekdays: [wd, (wd + 2) % 7, (wd + 4) % 7] }, sectionId: sec("Afternoon") });
  await p.createCard({ date: start, spec: reading, recurrence: everyDay, sectionId: sec("Evening") });

  // --- tonight's dinner, shared with the sample Family group
  const dinner = starterTemplates().find((t) => t.id === "starter-dinner")!.spec;
  const cook = newBlock.responsibility("Who’s cooking?", ["Cooking", "Dishes"]);
  cook.assignments[0].userId = "demo-maja";
  cook.assignments[1].userId = "demo-erik";
  await p.createCard({
    date: today,
    spec: { ...dinner, blocks: [dinner.blocks[0], cook, ...dinner.blocks.slice(1)] },
    groupId: DEMO_FAMILY,
    completionMode: "together",
    sectionId: sec("Evening"),
  });

  // --- materialise the last few days + today, then record some history
  for (let i = -3; i <= 0; i++) await p.loadDay(addDays(today, i));
  const doneAll = async (date: string, titles: string[], partial: Record<string, number> = {}) => {
    const { instances } = await p.repo.loadDay(date);
    for (const inst of instances) {
      if (!titles.includes(inst.spec.title) && !(inst.spec.title in partial)) continue;
      const checks: Record<ID, boolean> = {};
      const values: Record<ID, number> = {};
      let seen = 0;
      for (const b of inst.spec.blocks) {
        if (b.type === "checklist") {
          const upTo = partial[inst.spec.title] ?? b.items.length;
          b.items.forEach((it, idx) => (checks[it.id] = idx < upTo));
        }
        if (b.type === "progress") values[b.id] = partial[inst.spec.title] ?? b.target;
        seen++;
      }
      void seen;
      const manual = inst.spec.completion.mode === "manual" && !(inst.spec.title in partial);
      await p.repo.patchProgress(inst.id, inst.ownerId, { checks, values, completed: manual });
    }
  };
  await doneAll(addDays(today, -3), ["Morning routine", "Work", "Lunch", "Exercise", "Reading"]);
  await doneAll(addDays(today, -2), ["Morning routine", "Lunch", "Reading"], { Work: 3 });
  await doneAll(addDays(today, -1), ["Morning routine", "Work", "Lunch"]);
  await doneAll(today, ["Morning routine", "Lunch"], { Work: 2, Exercise: 10 });

  // --- reusable layouts and a custom card template
  await p.saveDayAsLayout(today, "Weekday setup", []);
  const slow = [
    { ...newCardSpec({ title: "Slow breakfast", time: "09:00", summary: "Coffee and the paper", cover: { kind: "preset", id: "dawn" }, blocks: [newBlock.note("Notes", "No screens until after breakfast.")] }), },
    { ...exercise, time: "11:00", summary: "Longer walk" },
    reading,
    { ...dinner, time: "19:00" },
  ];
  const layout = await p.saveDayAsLayout(today, "Weekend, slow", []);
  await p.updateLayout({ ...layout, entries: slow.map((spec, i) => ({ id: `e${i}`, spec, sectionId: null })) });
  const groceries = newBlock.checklist("List", ["Milk", "Eggs", "Bread"], "items");
  await p.saveTemplate("Grocery run", newCardSpec({ title: "Groceries", summary: "Weekly shop", cover: { kind: "color", color: "#3f4a2c" }, blocks: [groceries, newBlock.note("Notes", "")] }));
}

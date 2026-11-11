import { LocalRepo, memoryKV, DEMO_ME, DEMO_FAMILY } from "../src/lib/data/local";
import { memoryImageStore } from "../src/lib/data/imageStore";
import { Planner } from "../src/lib/data/planner";
import { newBlock, newCardSpec } from "../src/lib/domain/factory";

export const NOW = new Date("2026-11-10T09:00:00Z");
export const TODAY = "2026-11-10";
export { DEMO_ME, DEMO_FAMILY };

export function makeEnv() {
  const kv = memoryKV();
  const images = memoryImageStore(); // one shared "bucket", like the browser's IndexedDB
  const planners = new Map<string, Planner>();
  async function as(userId: string) {
    let p = planners.get(userId);
    if (!p) {
      const repo = new LocalRepo(kv, "Europe/Stockholm", images);
      repo.actingUserId = userId;
      p = new Planner(repo, () => NOW);
      planners.set(userId, p);
    }
    await p.init(); // always fresh, like a reload
    return p;
  }
  return { kv, as };
}

export const checklistCard = (title = "Routine", items = ["a", "b", "c"]) => {
  const cl = newBlock.checklist("Steps", items);
  return { cl, spec: newCardSpec({ title, time: "08:00", completion: { mode: "derived", blockIds: [cl.id] }, blocks: [cl] }) };
};

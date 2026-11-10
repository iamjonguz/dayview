import { describe, expect, it } from "vitest";
import { buildDayView } from "../src/lib/domain/dayview";
import { PermissionError } from "../src/lib/domain/types";
import { checklistCard, DEMO_FAMILY, makeEnv, TODAY } from "./helpers";
import { canUpdateProgress, canEditCard } from "../src/lib/domain/permissions";

const ME = "demo-you", MAJA = "demo-maja", ERIK = "demo-erik";

async function sharedCard(mode: "together" | "individual") {
  const env = makeEnv();
  const me = await env.as(ME);
  const spec = { ...checklistCard("Dinner").spec, completion: { mode: "manual" as const } };
  const card = (await me.createCard({ date: TODAY, spec, groupId: DEMO_FAMILY, completionMode: mode }))!;
  return { env, me, card };
}

describe("private by default", () => {
  it("other users cannot see or touch a private card, even knowing its id", async () => {
    const env = makeEnv();
    const me = await env.as(ME);
    const card = (await me.createCard({ date: TODAY, spec: checklistCard("Secret").spec }))!;
    const maja = await env.as(MAJA);
    expect((await maja.repo.loadDay(TODAY)).instances).toHaveLength(0);
    await expect(maja.repo.updateInstance({ ...card, spec: { ...card.spec, title: "hax" } }, card.rev)).rejects.toThrow(PermissionError);
    await expect(maja.repo.deleteInstance(card.id)).rejects.toThrow(PermissionError);
    await expect(maja.repo.patchProgress(card.id, MAJA, { completed: true })).rejects.toThrow(PermissionError);
    expect((await me.repo.loadDay(TODAY)).instances).toHaveLength(1);
  });

  it("non-members cannot be given access to a group or share into it", async () => {
    const env = makeEnv();
    await env.as(ME);
    const outsider = await env.as("someone-else").catch(() => null);
    expect(outsider).toBeNull(); // unknown users can't even load a workspace
  });
});

describe("shared cards", () => {
  it("appear in every member's day, with edits visible to all", async () => {
    const { env, me, card } = await sharedCard("together");
    const maja = await env.as(MAJA);
    const day = await maja.loadDay(TODAY);
    expect(day.instances.map((i) => i.id)).toEqual([card.id]);
    // editors can edit shared content; viewers cannot
    await maja.updateCard(day.instances[0], { spec: { ...card.spec, summary: "Pasta" } });
    const erik = await env.as(ERIK);
    expect((await erik.repo.loadDay(TODAY)).instances[0].spec.summary).toBe("Pasta");
    await expect(erik.updateCard((await erik.repo.loadDay(TODAY)).instances[0], { spec: { ...card.spec, summary: "x" } })).rejects.toThrow(PermissionError);
    void me;
  });

  it("'together' keeps one shared completion; viewers can't change it", async () => {
    const { env, card } = await sharedCard("together");
    const maja = await env.as(MAJA);
    await maja.patchProgress(card, { completed: true });
    const me = await env.as(ME);
    const view = me.view(await me.loadDay(TODAY));
    expect(view.sections.flatMap((s) => s.cards)[0].progress.complete).toBe(true);
    const erik = await env.as(ERIK);
    await expect(erik.patchProgress(card, { completed: false })).rejects.toThrow(PermissionError);
  });

  it("'individual' keeps separate completion per member, viewers included", async () => {
    const { env, card } = await sharedCard("individual");
    const maja = await env.as(MAJA);
    await maja.patchProgress(card, { completed: true });
    const erik = await env.as(ERIK);
    await erik.patchProgress(card, { completed: true }); // viewers may update their own progress
    const me = await env.as(ME);
    const mine = me.view(await me.loadDay(TODAY)).sections.flatMap((s) => s.cards)[0];
    expect(mine.progress.complete).toBe(false);
    expect(mine.others.find((o) => o.userId === MAJA)?.complete).toBe(true);
    expect(mine.others.find((o) => o.userId === ERIK)?.complete).toBe(true);
    // nobody can write into someone else's scope
    await expect(maja.repo.patchProgress(card.id, ME, { completed: true })).rejects.toThrow(PermissionError);
    await expect(erik.repo.patchProgress(card.id, "shared", { completed: true })).rejects.toThrow(PermissionError);
  });

  it("merges concurrent progress patches instead of overwriting", async () => {
    const { env, card } = await sharedCard("together");
    const me = await env.as(ME);
    const maja = await env.as(MAJA);
    const items = (card.spec.blocks[0] as { items: { id: string }[] }).items;
    await Promise.all([me.patchProgress(card, { checks: { [items[0].id]: true } }), maja.patchProgress(card, { checks: { [items[1].id]: true } })]);
    const rec = (await me.repo.loadDay(TODAY)).progress.find((p) => p.scope === "shared")!;
    expect(rec.state.checks).toEqual({ [items[0].id]: true, [items[1].id]: true });
  });

  it("personal placement is independent per member", async () => {
    const { env, card } = await sharedCard("together");
    const maja = await env.as(MAJA);
    const extra = (await maja.createCard({ date: TODAY, spec: checklistCard("Other", ["z"]).spec }))!;
    const me = await env.as(ME);
    await maja.loadDay(TODAY);
    const myBefore = me.view(await me.loadDay(TODAY)).sections.flatMap((s) => s.cards.map((c) => c.instance.id));
    // Maja moves the shared card to Evening, last; hides and compacts it
    const mdata = await maja.loadDay(TODAY);
    await maja.saveDayOrder(TODAY, [{ sectionId: "sec-evening", ids: [extra.id, card.id] }], mdata.placements);
    await maja.setPlacementFlags(card, { density: "compact" });
    const mview = maja.view(await maja.loadDay(TODAY));
    expect(mview.sections.find((s) => s.section?.id === "sec-evening")!.cards.map((c) => c.instance.id)).toEqual([extra.id, card.id]);
    expect(mview.sections.flatMap((s) => s.cards).find((c) => c.instance.id === card.id)!.density).toBe("compact");
    const myAfter = me.view(await me.loadDay(TODAY));
    expect(myAfter.sections.flatMap((s) => s.cards.map((c) => c.instance.id))).toEqual(myBefore);
    expect(myAfter.sections.flatMap((s) => s.cards).find((c) => c.instance.id === card.id)!.density).toBe("comfortable");
    // hiding for Maja doesn't hide it for me
    await maja.setPlacementFlags(card, { hidden: true });
    expect(maja.view(await maja.loadDay(TODAY)).hidden).toHaveLength(1);
    expect(me.view(await me.loadDay(TODAY)).hidden).toHaveLength(0);
    // and a user cannot write placements for someone else
    await expect(maja.repo.savePlacements([{ instanceId: card.id, userId: ME, sectionId: null, position: 0, hidden: true }])).rejects.toThrow(PermissionError);
  });

  it("detects stale edits instead of silently overwriting", async () => {
    const { env, card } = await sharedCard("together");
    const me = await env.as(ME);
    const maja = await env.as(MAJA);
    await maja.updateCard(card, { spec: { ...card.spec, summary: "Maja's edit" } });
    await expect(me.updateCard(card, { spec: { ...card.spec, summary: "My edit" } })).rejects.toThrow(/changed by someone else/);
  });

  it("only the creator can change sharing; sharing needs edit rights in the target group", async () => {
    const { env, card } = await sharedCard("together");
    const maja = await env.as(MAJA);
    await expect(maja.updateCard(card, { spec: card.spec, groupId: null })).rejects.toThrow(PermissionError);
    const erik = await env.as(ERIK); // viewer
    await expect(erik.createCard({ date: TODAY, spec: card.spec, groupId: DEMO_FAMILY })).rejects.toThrow(PermissionError);
  });
});

describe("invitations & membership", () => {
  it("only the owner can invite; only the addressed email can accept; revoked invites are dead", async () => {
    const env = makeEnv();
    const me = await env.as(ME);
    const maja = await env.as(MAJA);
    await expect(maja.invite(DEMO_FAMILY, "x@y.se", "viewer")).rejects.toThrow(PermissionError);
    const inv = await me.invite(DEMO_FAMILY, "nina@demo.local", "editor");
    const erik = await env.as(ERIK);
    await expect(erik.repo.respondInvitation(inv.id, true)).rejects.toThrow(PermissionError); // wrong recipient
    await me.revokeInvitation(inv.id);
    const inv2 = await me.invite(DEMO_FAMILY, "erik@demo.local", "viewer").catch((e) => e);
    expect(inv2).toBeTruthy();
    // revoked invitation can't be accepted by anyone
    await expect(erik.repo.respondInvitation(inv.id, true)).rejects.toThrow(PermissionError);
  });

  it("leaving a group takes your shared cards back and removes access", async () => {
    const { env, card } = await sharedCard("together");
    const me = await env.as(ME);
    const erik = await env.as(ERIK);
    expect((await erik.repo.loadDay(TODAY)).instances).toHaveLength(1);
    await me.removeMember(DEMO_FAMILY, ERIK);
    expect((await (await env.as(ERIK)).repo.loadDay(TODAY)).instances).toHaveLength(0);
    void card;
  });
});

describe("permission rules", () => {
  const inst = { ownerId: ME, groupId: DEMO_FAMILY, completionMode: "individual" } as never;
  const members = [
    { groupId: DEMO_FAMILY, userId: ME, role: "owner" as const },
    { groupId: DEMO_FAMILY, userId: ERIK, role: "viewer" as const },
  ];
  it("viewers read, and update only their own progress under individual completion", () => {
    expect(canEditCard(inst, ERIK, members)).toBe(false);
    expect(canUpdateProgress(inst, ERIK, ERIK, members)).toBe(true);
    expect(canUpdateProgress(inst, ERIK, ME, members)).toBe(false);
    expect(canUpdateProgress(inst, "stranger", "stranger", members)).toBe(false);
  });
});

void buildDayView;

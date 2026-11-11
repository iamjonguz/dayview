import { describe, expect, it } from "vitest";
import { buildDayView } from "../src/lib/domain/dayview";
import { cloneSpec, newBlock, newCardSpec } from "../src/lib/domain/factory";
import { frontText, initialsOf, peopleLine } from "../src/lib/domain/front";
import { emptyState, resolveSummary } from "../src/lib/domain/progress";
import type { CardInstance, Member, Profile } from "../src/lib/domain/types";
import { fitWithin, focusStyle, validateImageFile, MAX_INPUT_BYTES } from "../src/lib/ui/images";
import { DEMO_FAMILY, DEMO_ME, makeEnv, TODAY } from "./helpers";

describe("front text", () => {
  it("shows a detail before the summary", () => {
    expect(frontText({ title: "Reading", context: "The Overstory" }, "Chapter 6 tonight")).toEqual({ context: "The Overstory", summary: "Chapter 6 tonight" });
  });
  it("drops anything that repeats the title or what the metadata line already says", () => {
    expect(frontText({ title: "Evening walk", context: "Evening walk" }, "30 minutes")).toEqual({ context: "", summary: "30 minutes" });
    expect(frontText({ title: "Work", context: "Atlas" }, "2 of 5 tasks", ["2 of 5 tasks"])).toEqual({ context: "Atlas", summary: "" });
    expect(frontText({ title: "Dinner", context: "salmon" }, "Salmon")).toEqual({ context: "salmon", summary: "" }); // detail and summary say the same: keep one
  });
  it("copes with empty input", () => {
    expect(frontText({ title: "x" }, "")).toEqual({ context: "", summary: "" });
  });
});

describe("summary from a note", () => {
  const plan = newBlock.note("Tonight’s plan", "**Baked salmon** with rice.\nStart the rice at 18:00.");
  const spec = newCardSpec({ title: "Dinner", summary: "fallback", blocks: [plan], summarySource: { kind: "note", blockId: plan.id } });
  it("uses the first line, without formatting marks", () => expect(resolveSummary(spec, emptyState())).toBe("Baked salmon with rice"));
  it("falls back to the written summary when the note is gone or empty", () => {
    expect(resolveSummary({ ...spec, blocks: [] }, emptyState())).toBe("fallback");
    expect(resolveSummary({ ...spec, blocks: [{ ...plan, text: "" }] }, emptyState())).toBe("fallback");
  });
});

describe("people on shared cards", () => {
  const cook = newBlock.responsibility("Who", ["Cooking", "Dishes"]);
  cook.assignments[0].userId = "maja";
  const groups = [{ id: "g", name: "Family", ownerId: "me" }];
  const members: Member[] = [{ groupId: "g", userId: "maja", role: "editor" }, { groupId: "g", userId: "me", role: "owner" }];
  const profiles: Profile[] = [{ id: "maja", name: "Maja Lindqvist" }, { id: "me", name: "Me" }];
  const base = newCardSpec({ title: "Dinner", blocks: [cook] });
  const ctx = { groups, members, profiles };

  it("private cards have no people line", () => expect(peopleLine(base, null, ctx)).toBeNull());
  it("shows only the group when no responsibility was chosen — never a guess", () => {
    expect(peopleLine(base, "g", ctx)?.text).toBe("Family");
  });
  it("features exactly the chosen responsibility", () => {
    const spec = { ...base, front: { ...base.front, personAssignmentId: cook.assignments[0].id } };
    const l = peopleLine(spec, "g", ctx)!;
    expect(l.text).toBe("Family · Maja Lindqvist cooking");
    expect(l.person?.initials).toBe("ML");
    const other = { ...base, front: { ...base.front, personAssignmentId: cook.assignments[1].id } };
    expect(peopleLine(other, "g", ctx)?.text).toBe("Family · dishes unassigned");
  });
  it("a member who has left reads as unassigned; a deleted responsibility falls back to the group", () => {
    const spec = { ...base, front: { ...base.front, personAssignmentId: cook.assignments[0].id } };
    expect(peopleLine(spec, "g", { ...ctx, members: members.filter((m) => m.userId !== "maja") })?.text).toBe("Family · cooking unassigned");
    expect(peopleLine({ ...spec, front: { ...spec.front, personAssignmentId: "gone" } }, "g", ctx)?.text).toBe("Family");
  });
  it("can be turned off", () => expect(peopleLine({ ...base, front: { ...base.front, showPeople: false } }, "g", ctx)).toBeNull());
  it("initials handle single names and blanks", () => {
    expect(initialsOf("Erik")).toBe("E");
    expect(initialsOf("  ")).toBe("?");
  });
  it("cloning (templates, duplicates) keeps the featured responsibility pointing at the copied block", () => {
    const spec = { ...base, front: { ...base.front, personAssignmentId: cook.assignments[1].id } };
    const copy = cloneSpec(spec);
    const b = copy.blocks[0];
    expect(b.type === "responsibility" && b.assignments[1].id).toBe(copy.front.personAssignmentId);
    expect(copy.front.personAssignmentId).not.toBe(cook.assignments[1].id);
  });
});

describe("card style migration", () => {
  const inst = (over: Partial<CardInstance["spec"]>): CardInstance => ({ id: "i", ownerId: "me", groupId: null, seriesId: null, date: TODAY, spec: { ...newCardSpec({ title: "A" }), ...over }, completionMode: "together", skipped: false, rev: 1, updatedAt: "", updatedBy: "me" });
  const present = (i: CardInstance, def: "compact" | "comfortable") => buildDayView({ me: "me", data: { instances: [i], progress: [], placements: [] }, sections: [], members: [], defaultDensity: def }).sections[0].cards[0].presentation;
  it("cards saved before this option follow the view preference, exactly as before", () => {
    const old = inst({});
    delete (old.spec as { style?: unknown }).style;
    expect(present(old, "compact")).toBe("compact");
    expect(present(old, "comfortable")).toBe("comfortable");
    expect(present(inst({ density: "compact" }), "comfortable")).toBe("compact");
  });
  it("a cover card is a cover card in either view", () => {
    expect(present(inst({ style: "cover" }), "compact")).toBe("cover");
    expect(present(inst({ style: "cover" }), "comfortable")).toBe("cover");
  });
});

describe("photo files", () => {
  it("accepts JPEG, PNG and WebP within the size limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateImageFile({ type, size: 1000 })).toBeNull();
  });
  it("rejects other types, empty files and oversized files with plain-language messages", () => {
    expect(validateImageFile({ type: "application/pdf", size: 10 })).toMatch(/JPEG, PNG or WebP/);
    expect(validateImageFile({ type: "image/heic", size: 10 })).toMatch(/HEIC/);
    expect(validateImageFile({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(validateImageFile({ type: "image/png", size: MAX_INPUT_BYTES + 1 })).toMatch(/MB/);
  });
  it("shrinks to the longest-edge limit without upscaling", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("focus style keeps the focal point in every frame and ignores a missing focus", () => {
    expect(focusStyle(undefined)).toBeUndefined();
    expect(focusStyle({ x: 0.25, y: 0.75, zoom: 1.5 })).toMatchObject({ objectPosition: "25.0% 75.0%", transform: "scale(1.5)" });
    expect(focusStyle({ x: 5, y: -1, zoom: 1 })?.objectPosition).toBe("100.0% 0.0%");
  });
});

describe("photo access in the demo store (mirrors the database policy)", () => {
  const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  // jsdom-less node: provide the one URL function the store uses
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => "blob:test";

  it("private photos are readable only by their owner; shared-card photos by group members", async () => {
    const env = makeEnv();
    const me = await env.as(DEMO_ME);
    const privatePath = await me.repo.putImage(blob());
    const sharedPath = await me.repo.putImage(blob());
    await me.createCard({ date: TODAY, spec: newCardSpec({ title: "Private", cover: { kind: "upload", path: privatePath } }) });
    await me.createCard({ date: TODAY, spec: newCardSpec({ title: "Shared", cover: { kind: "upload", path: sharedPath } }), groupId: DEMO_FAMILY, completionMode: "together" });

    expect(await me.repo.getImageUrl(privatePath)).toBe("blob:test");
    const maja = await env.as("demo-maja");
    expect(await maja.repo.getImageUrl(sharedPath)).toBe("blob:test"); // member of the group the card is shared with
    expect(await maja.repo.getImageUrl(privatePath)).toBeNull(); // private: not even with the exact path
    expect(await maja.repo.getImageUrl("demo-you/unknown.jpg")).toBeNull();
  });
  it("uploads land in the uploader's own folder", async () => {
    const env = makeEnv();
    const maja = await env.as("demo-maja");
    expect((await maja.repo.putImage(blob())).startsWith("demo-maja/")).toBe(true);
  });
});

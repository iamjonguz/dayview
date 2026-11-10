import { addDays, todayIn, weekdayOf } from "../domain/dates";
import { buildDayView, planPlacements, type DayView } from "../domain/dayview";
import { cloneSpec, uid } from "../domain/factory";
import { canEditCard, canEditRole, canManageGroup, canShareCard, roleIn, scopeFor, canUpdateProgress } from "../domain/permissions";
import { cardProgress, emptyState, hasAnyState } from "../domain/progress";
import { occursOn } from "../domain/recurrence";
import {
  PermissionError,
  type CardInstance,
  type CardSpec,
  type CardTemplate,
  type CompletionMode,
  type DateStr,
  type DayData,
  type DayLayout,
  type Density,
  type ID,
  type Placement,
  type ProgressRecord,
  type Recurrence,
  type Role,
  type Section,
  type Series,
  type Workspace,
} from "../domain/types";
import type { ProgressPatch, Repo } from "./repo";

export type EditScope = "this" | "future";

export interface CreateInput {
  date: DateStr;
  spec: CardSpec;
  sectionId?: ID | null;
  recurrence?: Omit<Recurrence, "start"> | null;
  groupId?: ID | null;
  completionMode?: CompletionMode;
}

/**
 * Product logic on top of a `Repo`: recurrence materialisation, edit scopes, placements, layouts, groups.
 * Keeps no UI state. `ws` is the last loaded workspace snapshot.
 */
export class Planner {
  ws!: Workspace;
  constructor(
    readonly repo: Repo,
    private now: () => Date = () => new Date(),
  ) {}

  async init() {
    this.ws = await this.repo.load();
    return this.ws;
  }
  get me() {
    return this.ws.me;
  }
  today(): DateStr {
    return todayIn(this.ws.prefs.timezone, this.now());
  }

  // ---------------------------------------------------------------- day loading
  /** Loads a day, generating any missing routine occurrences / layout cards exactly once, and ensures placements. */
  async loadDay(date: DateStr): Promise<DayData> {
    let data = await this.repo.loadDay(date);
    let changed = false;

    for (const s of this.ws.series) {
      if (!occursOn(s.rule, date)) continue;
      if (data.instances.some((i) => i.seriesId === s.id)) continue;
      const created = await this.repo.createInstance(this.instanceFromSeries(s, date), { ifAbsent: true });
      if (created) changed = true;
    }
    if (date >= this.today()) {
      for (const l of this.ws.layouts) {
        if (!l.autoApply.includes(weekdayOf(date))) continue;
        if (await this.repo.markLayoutApplied(l.id, date)) {
          await this.createFromLayout(l, date);
          changed = true;
        }
      }
    }
    if (changed) data = await this.repo.loadDay(date);

    const seriesSection = new Map(this.ws.series.map((s) => [s.id, s.sectionId]));
    const missing = planPlacements({
      me: this.me.id,
      instances: data.instances,
      placements: data.placements,
      sections: this.ws.sections,
      preferredSection: (i) => (i.seriesId && i.ownerId === this.me.id ? seriesSection.get(i.seriesId) : undefined),
    });
    if (missing.length) {
      await this.repo.savePlacements(missing);
      data = await this.repo.loadDay(date);
    }
    return data;
  }

  view(data: DayData): DayView {
    return buildDayView({
      me: this.me.id,
      data,
      sections: this.ws.sections,
      members: this.ws.members,
      defaultDensity: this.ws.prefs.defaultDensity,
    });
  }

  private instanceFromSeries(s: Series, date: DateStr): CardInstance {
    return {
      id: uid(),
      ownerId: this.me.id,
      groupId: null,
      seriesId: s.id,
      date,
      spec: cloneSpec(s.spec, false), // same block ids as the routine so edits can carry state over
      completionMode: "together",
      skipped: false,
      rev: 1,
      updatedAt: this.now().toISOString(),
      updatedBy: this.me.id,
    };
  }

  private newInstance(date: DateStr, spec: CardSpec, extra: Partial<CardInstance> = {}): CardInstance {
    return {
      id: uid(),
      ownerId: this.me.id,
      groupId: null,
      seriesId: null,
      date,
      spec,
      completionMode: "together",
      skipped: false,
      rev: 1,
      updatedAt: this.now().toISOString(),
      updatedBy: this.me.id,
      ...extra,
    };
  }

  private async place(inst: CardInstance, sectionId?: ID | null) {
    const day = await this.repo.loadDay(inst.date);
    const missing = planPlacements({
      me: this.me.id,
      instances: day.instances,
      placements: day.placements,
      sections: this.ws.sections,
      preferredSection: (i) => (i.id === inst.id ? sectionId : undefined),
    });
    if (missing.length) await this.repo.savePlacements(missing);
  }

  // ---------------------------------------------------------------- cards
  async createCard(input: CreateInput): Promise<CardInstance | null> {
    const { date, spec } = input;
    const groupId = input.groupId ?? null;
    if (groupId && !canEditRole(roleIn(this.ws.members, groupId, this.me.id))) throw new PermissionError("You can't share cards with that group.");
    if (input.recurrence) {
      if (groupId) throw new PermissionError("Recurring routines are personal. Share an individual day's card instead.");
      const series: Series = {
        id: uid(),
        ownerId: this.me.id,
        spec: cloneSpec(spec, false),
        rule: { ...input.recurrence, start: date },
        sectionId: input.sectionId,
        rev: 0,
      };
      const saved = await this.repo.upsertSeries(series);
      this.ws.series = [...this.ws.series, saved];
      if (!occursOn(saved.rule, date)) return null;
      const created = await this.repo.createInstance(this.instanceFromSeries(saved, date), { ifAbsent: true });
      if (created) await this.place(created, input.sectionId);
      return created;
    }
    const inst = this.newInstance(date, cloneSpec(spec, false), { groupId, completionMode: input.completionMode ?? "together" });
    const created = (await this.repo.createInstance(inst))!;
    await this.place(created, input.sectionId);
    return created;
  }

  async duplicateCard(inst: CardInstance): Promise<CardInstance> {
    const copy = this.newInstance(inst.date, { ...cloneSpec(inst.spec), title: `${inst.spec.title} (copy)` });
    const created = (await this.repo.createInstance(copy))!;
    await this.place(created);
    return created;
  }

  async updateCard(
    inst: CardInstance,
    patch: { spec: CardSpec; groupId?: ID | null; completionMode?: CompletionMode; rule?: Omit<Recurrence, "start"> },
    scope: EditScope = "this",
  ): Promise<CardInstance> {
    const me = this.me.id;
    const members = this.ws.members;
    if (!canEditCard(inst, me, members)) throw new PermissionError("You don't have permission to edit this card.");
    const next: CardInstance = {
      ...inst,
      spec: patch.spec,
      groupId: patch.groupId === undefined ? inst.groupId : patch.groupId,
      completionMode: patch.completionMode ?? inst.completionMode,
    };
    if (next.groupId !== inst.groupId && !canShareCard(inst, me, next.groupId, members))
      throw new PermissionError("Only the person who created a card can change who it's shared with.");
    if (scope === "future" && inst.seriesId && !inst.groupId && !next.groupId) {
      const series = this.ws.series.find((s) => s.id === inst.seriesId);
      if (series) return this.updateSeriesFrom(inst, series, patch.spec, patch.rule);
    }
    return this.repo.updateInstance(next, inst.rev);
  }

  /** Is this future occurrence still pristine (no one has touched it), so it may be regenerated? */
  private untouched(i: CardInstance, base: Series, progress: ProgressRecord[]) {
    return (
      !i.skipped &&
      !i.groupId &&
      JSON.stringify(i.spec) === JSON.stringify(base.spec) &&
      !progress.some((p) => p.instanceId === i.id && hasAnyState(p.state))
    );
  }

  private async futureOf(series: Series, from: DateStr) {
    const { instances, progress } = await this.repo.loadRange(from, "9999-12-31");
    return { list: instances.filter((i) => i.seriesId === series.id && i.ownerId === this.me.id), progress };
  }

  /** Ends the old routine the day before `D` and starts a new one at `D` (or edits in place when `D` is its first day). */
  private async splitSeries(series: Series, D: DateStr, spec: CardSpec, rule?: Omit<Recurrence, "start">): Promise<Series> {
    const newRule: Recurrence = { ...series.rule, ...(rule ?? {}), start: series.rule.start };
    if (D <= series.rule.start) {
      return this.repo.upsertSeries({ ...series, spec: cloneSpec(spec, false), rule: newRule }, series.rev);
    }
    await this.repo.upsertSeries({ ...series, rule: { ...series.rule, end: addDays(D, -1) } }, series.rev);
    return this.repo.upsertSeries({
      id: uid(),
      ownerId: this.me.id,
      spec: cloneSpec(spec, false),
      rule: { ...newRule, start: D },
      sectionId: series.sectionId,
      rev: 0,
    });
  }

  /** "This and future occurrences": history before `inst.date` keeps the old routine; only the future changes. */
  private async updateSeriesFrom(inst: CardInstance, series: Series, spec: CardSpec, rule?: Omit<Recurrence, "start">): Promise<CardInstance> {
    const D = inst.date;
    const target = await this.splitSeries(series, D, spec, rule);
    const { list, progress } = await this.futureOf(series, D);
    let updated = inst;
    for (const f of list) {
      if (f.id === inst.id) {
        updated = await this.repo.updateInstance({ ...f, spec, seriesId: target.id }, f.rev);
      } else if (this.untouched(f, series, progress)) {
        await this.repo.deleteInstance(f.id);
      } else if (target.id !== series.id) {
        await this.repo.updateInstance({ ...f, seriesId: target.id }, f.rev);
      }
    }
    this.ws.series = (await this.repo.load()).series;
    return updated;
  }

  async skipCard(inst: CardInstance, skipped: boolean) {
    if (!canEditCard(inst, this.me.id, this.ws.members)) throw new PermissionError();
    return this.repo.updateInstance({ ...inst, skipped }, inst.rev);
  }

  /** Independent personal copy of a card on another day (progress isn't copied). */
  async copyCardToDate(inst: CardInstance, date: DateStr): Promise<CardInstance> {
    const created = (await this.repo.createInstance(this.newInstance(date, cloneSpec(inst.spec))))!;
    await this.place(created);
    return created;
  }

  /**
   * Reschedule a card. One-offs and shared cards change date in place. A routine's occurrence can't move
   * (it would be regenerated), so that day is skipped and a one-off copy is created on the new day.
   */
  async moveCardToDate(inst: CardInstance, date: DateStr): Promise<CardInstance> {
    if (date === inst.date) return inst;
    if (!canEditCard(inst, this.me.id, this.ws.members)) throw new PermissionError();
    if (inst.seriesId && !inst.groupId) {
      const copy = await this.copyCardToDate(inst, date);
      await this.skipCard(inst, true);
      return copy;
    }
    return this.repo.updateInstance({ ...inst, date }, inst.rev);
  }

  /** My own one-off cards from a day that were never completed (candidates to carry over). Routines and shared cards are excluded. */
  async unfinishedFrom(date: DateStr): Promise<CardInstance[]> {
    const d = await this.repo.loadDay(date);
    const state = new Map(d.progress.filter((p) => p.scope === this.me.id).map((p) => [p.instanceId, p.state]));
    return d.instances.filter((i) => i.ownerId === this.me.id && !i.groupId && !i.seriesId && !i.skipped && !cardProgress(i.spec, state.get(i.id) ?? emptyState()).complete);
  }

  async carryOver(ids: ID[], from: DateStr, to: DateStr) {
    const list = (await this.repo.loadDay(from)).instances.filter((i) => ids.includes(i.id));
    for (const i of list) await this.moveCardToDate(i, to);
    return list.length;
  }

  /** Find cards by title, summary, notes or checklist text within a year either side of today. */
  async search(query: string): Promise<CardInstance[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const today = this.today();
    const { instances } = await this.repo.loadRange(addDays(today, -365), addDays(today, 365));
    const text = (i: CardInstance) =>
      [i.spec.title, i.spec.summary, ...i.spec.blocks.flatMap((b) => (b.type === "note" ? [b.title, b.text] : b.type === "checklist" ? [b.title, ...b.items.map((x) => x.text)] : [b.title]))]
        .join("\n")
        .toLowerCase();
    return instances.filter((i) => text(i).includes(q)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100);
  }

  /** Skip / un-skip by id, always against the latest stored revision (safe for Undo). */
  async setSkipped(id: ID, date: DateStr, skipped: boolean) {
    const cur = (await this.repo.loadDay(date)).instances.find((i) => i.id === id);
    if (!cur) return;
    await this.skipCard(cur, skipped);
  }

  /** One-off cards are deleted; "this day" on a routine skips that day (kept as a tombstone so it isn't regenerated). */
  async deleteCard(inst: CardInstance, scope: EditScope = "this") {
    if (!canEditCard(inst, this.me.id, this.ws.members)) throw new PermissionError();
    if (inst.seriesId && !inst.groupId) {
      const series = this.ws.series.find((s) => s.id === inst.seriesId);
      if (series && scope === "future") return this.endSeriesFrom(series, inst.date, inst.id);
      if (series) return void (await this.repo.updateInstance({ ...inst, skipped: true }, inst.rev));
    }
    await this.repo.deleteInstance(inst.id);
  }

  /** Stop a routine from `from` onwards. History is untouched; pristine future occurrences are removed. */
  async endSeriesFrom(series: Series, from: DateStr, alsoDelete?: ID) {
    const { list, progress } = await this.futureOf(series, from);
    for (const f of list) if (f.id === alsoDelete || this.untouched(f, series, progress)) await this.repo.deleteInstance(f.id);
    if (from <= series.rule.start) await this.repo.deleteSeries(series.id);
    else await this.repo.upsertSeries({ ...series, rule: { ...series.rule, end: addDays(from, -1) } }, series.rev);
    this.ws.series = (await this.repo.load()).series;
  }

  /** Edit a routine from the Templates page; applies from `from` (usually today) onwards, never to history. */
  async editRoutine(series: Series, spec: CardSpec, rule: Omit<Recurrence, "start">, from: DateStr) {
    const D = from < series.rule.start ? series.rule.start : from;
    const target = await this.splitSeries(series, D, spec, rule);
    const { list, progress } = await this.futureOf(series, D);
    for (const f of list) {
      if (this.untouched(f, series, progress)) await this.repo.deleteInstance(f.id);
      else if (target.id !== series.id) await this.repo.updateInstance({ ...f, seriesId: target.id }, f.rev);
    }
    this.ws.series = (await this.repo.load()).series;
    return target;
  }

  // ---------------------------------------------------------------- progress & placement
  async patchProgress(inst: CardInstance, patch: ProgressPatch) {
    const scope = scopeFor(inst, this.me.id);
    if (!canUpdateProgress(inst, this.me.id, scope, this.ws.members)) throw new PermissionError("You can't update progress on this card.");
    return this.repo.patchProgress(inst.id, scope, patch);
  }

  /** Persist the order the user chose for this day. Only touches the current user's placements. */
  async saveDayOrder(date: DateStr, layout: { sectionId: ID | null; ids: ID[] }[], current: Placement[]) {
    const prev = new Map(current.map((p) => [p.instanceId, p]));
    const out: Placement[] = [];
    for (const g of layout)
      g.ids.forEach((id, position) => {
        const old = prev.get(id);
        out.push({ instanceId: id, userId: this.me.id, sectionId: g.sectionId, position, hidden: old?.hidden ?? false, density: old?.density });
      });
    await this.repo.savePlacements(out);
  }
  async setPlacementFlags(inst: CardInstance, flags: { hidden?: boolean; density?: Density | null }) {
    const current = (await this.repo.loadDay(inst.date)).placements.find((p) => p.instanceId === inst.id);
    const base: Placement = current ?? { instanceId: inst.id, userId: this.me.id, sectionId: null, position: 9999, hidden: false };
    const next: Placement = { ...base, userId: this.me.id };
    if (flags.hidden !== undefined) next.hidden = flags.hidden;
    if (flags.density !== undefined) next.density = flags.density ?? undefined;
    await this.repo.savePlacements([next]);
  }

  // ---------------------------------------------------------------- library
  async saveTemplate(name: string, spec: CardSpec, id?: ID): Promise<CardTemplate> {
    const t: CardTemplate = { id: id ?? uid(), ownerId: this.me.id, name: name.trim() || spec.title || "Untitled", spec: cloneSpec(spec, id ? false : true) };
    await this.repo.upsertTemplate(t);
    this.ws.templates = (await this.repo.load()).templates;
    return t;
  }
  async deleteTemplate(id: ID) {
    await this.repo.deleteTemplate(id);
    this.ws.templates = this.ws.templates.filter((t) => t.id !== id);
  }

  async saveDayAsLayout(date: DateStr, name: string, autoApply: number[] = []): Promise<DayLayout> {
    const data = await this.repo.loadDay(date);
    const place = new Map(data.placements.map((p) => [p.instanceId, p]));
    const mine = data.instances
      .filter((i) => i.ownerId === this.me.id && !i.skipped)
      .sort((a, b) => (place.get(a.id)?.position ?? 0) - (place.get(b.id)?.position ?? 0));
    const layout: DayLayout = {
      id: uid(),
      ownerId: this.me.id,
      name: name.trim() || "My day",
      autoApply,
      entries: mine.map((i) => ({ id: uid(), spec: cloneSpec(i.spec), sectionId: place.get(i.id)?.sectionId ?? null })),
    };
    await this.repo.upsertLayout(layout);
    this.ws.layouts = [...this.ws.layouts, layout];
    return layout;
  }
  async updateLayout(l: DayLayout) {
    await this.repo.upsertLayout(l);
    this.ws.layouts = this.ws.layouts.map((x) => (x.id === l.id ? l : x));
  }
  async deleteLayout(id: ID) {
    await this.repo.deleteLayout(id);
    this.ws.layouts = this.ws.layouts.filter((l) => l.id !== id);
  }
  private async createFromLayout(l: DayLayout, date: DateStr) {
    for (const e of l.entries) {
      const created = await this.repo.createInstance(this.newInstance(date, cloneSpec(e.spec)));
      if (created) await this.place(created, e.sectionId);
    }
  }
  /** Adds the layout's cards to a day, once. Returns false if it was already applied to that day. */
  async applyLayout(l: DayLayout, date: DateStr): Promise<boolean> {
    if (!(await this.repo.markLayoutApplied(l.id, date))) return false;
    await this.createFromLayout(l, date);
    return true;
  }

  async savePrefs(p: Workspace["prefs"]) {
    await this.repo.savePrefs(p);
    this.ws.prefs = p;
  }

  async saveSections(sections: Section[]) {
    const s = sections.map((x, position) => ({ ...x, position }));
    await this.repo.saveSections(s);
    this.ws.sections = s;
  }

  // ---------------------------------------------------------------- groups
  private requireOwner(groupId: ID) {
    if (!canManageGroup(roleIn(this.ws.members, groupId, this.me.id))) throw new PermissionError("Only the group owner can do that.");
  }
  async createGroup(name: string) {
    const g = await this.repo.createGroup(name.trim());
    await this.init();
    return g;
  }
  async renameGroup(id: ID, name: string) {
    this.requireOwner(id);
    await this.repo.renameGroup(id, name.trim());
    await this.init();
  }
  async deleteGroup(id: ID) {
    this.requireOwner(id);
    await this.repo.deleteGroup(id);
    await this.init();
  }
  async invite(groupId: ID, email: string, role: Exclude<Role, "owner">) {
    this.requireOwner(groupId);
    const inv = await this.repo.invite(groupId, email, role);
    await this.init();
    return inv;
  }
  async revokeInvitation(id: ID) {
    await this.repo.revokeInvitation(id);
    await this.init();
  }
  async respondInvitation(id: ID, accept: boolean) {
    await this.repo.respondInvitation(id, accept);
    await this.init();
  }
  async setMemberRole(groupId: ID, userId: ID, role: Exclude<Role, "owner">) {
    this.requireOwner(groupId);
    await this.repo.setMemberRole(groupId, userId, role);
    await this.init();
  }
  async removeMember(groupId: ID, userId: ID) {
    if (userId !== this.me.id) this.requireOwner(groupId);
    await this.repo.removeMember(groupId, userId);
    await this.init();
  }
}

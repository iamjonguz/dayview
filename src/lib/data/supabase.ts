import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultSections, starterTemplates } from "../domain/starters";
import { uid } from "../domain/factory";
import {
  ConflictError,
  PermissionError,
  type CardInstance,
  type CardTemplate,
  type DateStr,
  type DayData,
  type DayLayout,
  type Group,
  type ID,
  type Invitation,
  type Member,
  type Placement,
  type Prefs,
  type Profile,
  type ProgressRecord,
  type Role,
  type Scope,
  type Section,
  type Series,
  type Workspace,
} from "../domain/types";
import { browserTimezone } from "../domain/dates";
import type { ProgressPatch, Repo } from "./repo";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const fail = (e: { code?: string; message: string } | null): never => {
  if (e?.code === "42501" || /row-level security|permission denied|not valid for this account|only the creator/i.test(e?.message ?? ""))
    throw new PermissionError(e?.message.includes("creator") ? "Only the person who created a card can change who it's shared with." : undefined);
  throw new Error(e?.message ?? "Request failed");
};
const ok = <T>(r: { data: T; error: any }): T => (r.error ? fail(r.error) : r.data);

const toInstance = (r: Row): CardInstance => ({
  id: r.id,
  ownerId: r.owner_id,
  groupId: r.group_id,
  seriesId: r.series_id,
  date: r.date,
  spec: r.spec,
  completionMode: r.completion_mode,
  skipped: r.skipped,
  rev: r.rev,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});
const fromInstance = (i: CardInstance): Row => ({
  id: i.id,
  owner_id: i.ownerId,
  group_id: i.groupId,
  series_id: i.seriesId,
  date: i.date,
  spec: i.spec,
  completion_mode: i.completionMode,
  skipped: i.skipped,
});
const toSeries = (r: Row): Series => ({ id: r.id, ownerId: r.owner_id, spec: r.spec, rule: r.rule, sectionId: r.section_id, rev: r.rev });
const toProgress = (r: Row): ProgressRecord => ({ instanceId: r.instance_id, scope: r.scope, state: r.state, rev: r.rev });
const toPlacement = (r: Row): Placement => ({
  instanceId: r.instance_id,
  userId: r.user_id,
  sectionId: r.section_id,
  position: r.position,
  hidden: r.hidden,
  density: r.density ?? undefined,
});

/**
 * Supabase-backed repository. Authorization is enforced by Postgres RLS (see supabase/migrations);
 * this class only translates between rows and domain objects. Requires a signed-in session.
 */
export class SupabaseRepo implements Repo {
  readonly mode = "supabase" as const;
  private userId!: ID;
  constructor(private sb: SupabaseClient) {}

  async load(): Promise<Workspace> {
    const { data: u, error } = await this.sb.auth.getUser();
    if (error || !u.user) throw new Error("Not signed in");
    this.userId = u.user.id;
    const me = this.userId;

    const [profile, sections, templates, series, layouts, groups, members, ownInv, myInv] = await Promise.all([
      this.sb.from("profiles").select("*").eq("id", me).maybeSingle(),
      this.sb.from("sections").select("*").order("position"),
      this.sb.from("card_templates").select("*"),
      this.sb.from("series").select("*"),
      this.sb.from("day_layouts").select("*"),
      this.sb.from("groups").select("*"),
      this.sb.from("group_members").select("*"),
      this.sb.from("group_invitations").select("*").order("created_at", { ascending: false }),
      this.sb.rpc("my_invitations"),
    ]);
    let prof = ok(profile) as Row | null;
    if (!prof) {
      prof = ok(await this.sb.from("profiles").insert({ id: me, display_name: u.user.email?.split("@")[0] ?? "Me", timezone: browserTimezone() }).select().single());
    }
    let secs: Section[] = (ok(sections) as Row[]).map((r) => ({ id: r.id, name: r.name, icon: r.icon, from: r.from_time ?? undefined, position: r.position }));
    if (secs.length === 0) {
      secs = defaultSections().map((s) => ({ ...s, id: uid() }));
      await this.saveSections(secs);
    }
    const memberRows: Member[] = (ok(members) as Row[]).map((r) => ({ groupId: r.group_id, userId: r.user_id, role: r.role }));
    const ids = [...new Set(memberRows.map((m) => m.userId).concat(me))];
    const profs = ok(await this.sb.from("profiles").select("id, display_name").in("id", ids)) as Row[];
    const groupRows = (ok(groups) as Row[]).map((g): Group => ({ id: g.id, name: g.name, ownerId: g.owner_id }));
    const names = new Map(groupRows.map((g) => [g.id, g.name]));
    const invitations: Invitation[] = [
      ...(ok(ownInv) as Row[]).map((r) => ({ id: r.id, groupId: r.group_id, groupName: names.get(r.group_id), email: r.email, role: r.role, status: r.status, invitedBy: r.invited_by, createdAt: r.created_at })),
      ...(ok(myInv) as Row[]).map((r) => ({ id: r.id, groupId: r.group_id, groupName: r.group_name, email: r.email, role: r.role, status: r.status, invitedBy: r.invited_by, createdAt: r.created_at })),
    ];
    return {
      me: { id: me, name: prof!.display_name, email: u.user.email },
      prefs: { timezone: prof!.timezone, defaultDensity: prof!.default_density },
      sections: secs,
      templates: [
        ...starterTemplates(),
        ...(ok(templates) as Row[]).map((r): CardTemplate => ({ id: r.id, ownerId: r.owner_id, name: r.name, description: r.description ?? undefined, spec: r.spec })),
      ],
      series: (ok(series) as Row[]).map(toSeries),
      layouts: (ok(layouts) as Row[]).map((r): DayLayout => ({ id: r.id, ownerId: r.owner_id, name: r.name, autoApply: r.auto_apply, entries: r.entries })),
      groups: groupRows,
      members: memberRows,
      profiles: profs.map((p): Profile => ({ id: p.id, name: p.display_name })),
      invitations,
    };
  }

  async savePrefs(p: Prefs) {
    ok(await this.sb.from("profiles").update({ timezone: p.timezone, default_density: p.defaultDensity }).eq("id", this.userId));
  }
  async saveSections(s: Section[]) {
    const rows = s.map((x) => ({ id: x.id, user_id: this.userId, name: x.name, icon: x.icon, from_time: x.from ?? null, position: x.position }));
    ok(await this.sb.from("sections").upsert(rows));
    const keep = s.map((x) => x.id);
    const existing = ok(await this.sb.from("sections").select("id")) as Row[];
    const drop = existing.map((r) => r.id).filter((id) => !keep.includes(id));
    if (drop.length) ok(await this.sb.from("sections").delete().in("id", drop));
  }

  async upsertTemplate(t: CardTemplate) {
    ok(await this.sb.from("card_templates").upsert({ id: t.id, owner_id: this.userId, name: t.name, description: t.description ?? null, spec: t.spec }));
  }
  async deleteTemplate(id: ID) {
    ok(await this.sb.from("card_templates").delete().eq("id", id));
  }
  async upsertSeries(s: Series, expectedRev?: number) {
    const row = { id: s.id, owner_id: this.userId, spec: s.spec, rule: s.rule, section_id: s.sectionId ?? null };
    if (expectedRev === undefined) return toSeries(ok(await this.sb.from("series").insert(row).select().single()) as Row);
    const res = ok(await this.sb.from("series").update(row).eq("id", s.id).eq("rev", expectedRev).select());
    if (!(res as Row[]).length) throw new ConflictError("This routine was changed elsewhere.");
    return toSeries((res as Row[])[0]);
  }
  async deleteSeries(id: ID) {
    ok(await this.sb.from("series").delete().eq("id", id));
  }
  async upsertLayout(l: DayLayout) {
    ok(await this.sb.from("day_layouts").upsert({ id: l.id, owner_id: this.userId, name: l.name, auto_apply: l.autoApply, entries: l.entries }));
  }
  async deleteLayout(id: ID) {
    ok(await this.sb.from("day_layouts").delete().eq("id", id));
  }
  async markLayoutApplied(layoutId: ID, date: DateStr) {
    const res = ok(
      await this.sb.from("layout_applications").upsert({ user_id: this.userId, layout_id: layoutId, date }, { onConflict: "user_id,layout_id,date", ignoreDuplicates: true }).select(),
    ) as Row[];
    return res.length > 0;
  }

  async loadDay(date: DateStr): Promise<DayData> {
    const instances = (ok(await this.sb.from("card_instances").select("*").eq("date", date)) as Row[]).map(toInstance);
    const ids = instances.map((i) => i.id);
    if (!ids.length) return { instances, progress: [], placements: [] };
    const [progress, placements] = await Promise.all([
      this.sb.from("card_progress").select("*").in("instance_id", ids),
      this.sb.from("placements").select("*").eq("user_id", this.userId).in("instance_id", ids),
    ]);
    return { instances, progress: (ok(progress) as Row[]).map(toProgress), placements: (ok(placements) as Row[]).map(toPlacement) };
  }
  async loadRange(from: DateStr, to: DateStr) {
    const instances = (ok(await this.sb.from("card_instances").select("*").gte("date", from).lte("date", to).order("date")) as Row[]).map(toInstance);
    const ids = instances.map((i) => i.id);
    const progress = ids.length ? (ok(await this.sb.from("card_progress").select("*").in("instance_id", ids)) as Row[]).map(toProgress) : [];
    return { instances, progress };
  }
  async loadSeriesInstances(seriesId: ID, fromDate?: DateStr) {
    let q = this.sb.from("card_instances").select("*").eq("series_id", seriesId).eq("owner_id", this.userId);
    if (fromDate) q = q.gte("date", fromDate);
    return (ok(await q) as Row[]).map(toInstance);
  }
  async createInstance(i: CardInstance, opts?: { ifAbsent?: boolean }) {
    if (i.seriesId) {
      const res = ok(
        await this.sb.from("card_instances").upsert(fromInstance(i), { onConflict: "series_id,date", ignoreDuplicates: true }).select(),
      ) as Row[];
      if (!res.length) {
        if (opts?.ifAbsent) return null;
        throw new ConflictError("This routine already has a card on that day.");
      }
      return toInstance(res[0]);
    }
    return toInstance(ok(await this.sb.from("card_instances").insert(fromInstance(i)).select().single()) as Row);
  }
  async updateInstance(i: CardInstance, expectedRev: number) {
    const { id: _id, ...patch } = fromInstance(i);
    void _id;
    const res = ok(await this.sb.from("card_instances").update(patch).eq("id", i.id).eq("rev", expectedRev).select()) as Row[];
    if (res.length) return toInstance(res[0]);
    // zero rows: stale revision, or RLS said no. Look again to tell which.
    const cur = ok(await this.sb.from("card_instances").select("rev").eq("id", i.id).maybeSingle()) as Row | null;
    if (!cur) throw new ConflictError("This card no longer exists or you no longer have access.");
    if (cur.rev !== expectedRev) throw new ConflictError();
    throw new PermissionError("You don't have permission to edit this card.");
  }
  async deleteInstance(id: ID) {
    const res = ok(await this.sb.from("card_instances").delete().eq("id", id).select("id")) as Row[];
    if (!res.length) {
      const still = ok(await this.sb.from("card_instances").select("id").eq("id", id).maybeSingle());
      if (still) throw new PermissionError();
    }
  }
  async patchProgress(instanceId: ID, scope: Scope, patch: ProgressPatch) {
    return toProgress(ok(await this.sb.rpc("patch_progress", { inst: instanceId, sc: scope, patch })));
  }
  async savePlacements(p: Placement[]) {
    if (!p.length) return;
    ok(
      await this.sb.from("placements").upsert(
        p.map((x) => ({ instance_id: x.instanceId, user_id: this.userId, section_id: x.sectionId, position: x.position, hidden: x.hidden, density: x.density ?? null })),
        { onConflict: "instance_id,user_id" },
      ),
    );
  }

  async createGroup(name: string) {
    const r = ok(await this.sb.from("groups").insert({ name, owner_id: this.userId }).select().single()) as Row;
    return { id: r.id, name: r.name, ownerId: r.owner_id };
  }
  async renameGroup(id: ID, name: string) {
    ok(await this.sb.from("groups").update({ name }).eq("id", id));
  }
  async deleteGroup(id: ID) {
    ok(await this.sb.from("groups").delete().eq("id", id));
  }
  async invite(groupId: ID, email: string, role: Exclude<Role, "owner">) {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error("Enter a valid email address.");
    const { data, error } = await this.sb.from("group_invitations").insert({ group_id: groupId, email: e, role, invited_by: this.userId }).select().single();
    if (error?.code === "23505") throw new Error("There is already a pending invitation for that email.");
    if (error) fail(error);
    const r = data as Row;
    return { id: r.id, groupId: r.group_id, email: r.email, role: r.role, status: r.status, invitedBy: r.invited_by, createdAt: r.created_at } as Invitation;
  }
  async revokeInvitation(id: ID) {
    ok(await this.sb.from("group_invitations").update({ status: "revoked" }).eq("id", id));
  }
  async respondInvitation(id: ID, accept: boolean) {
    ok(await this.sb.rpc("respond_invitation", { inv_id: id, accept }));
  }
  async setMemberRole(groupId: ID, userId: ID, role: Exclude<Role, "owner">) {
    ok(await this.sb.from("group_members").update({ role }).eq("group_id", groupId).eq("user_id", userId));
  }
  async removeMember(groupId: ID, userId: ID) {
    ok(await this.sb.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId));
  }

  subscribe(cb: () => void) {
    let t: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(t);
      t = setTimeout(cb, 250);
    };
    const ch = this.sb.channel("dayview-changes");
    for (const table of ["card_instances", "card_progress", "group_members", "group_invitations", "groups"])
      ch.on("postgres_changes", { event: "*", schema: "public", table }, fire);
    ch.subscribe();
    return () => {
      clearTimeout(t);
      void this.sb.removeChannel(ch);
    };
  }
}

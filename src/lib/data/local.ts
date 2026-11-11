import { uid } from "../domain/factory";
import {
  canEditCard,
  canEditRole,
  canManageGroup,
  canShareCard,
  canUpdateProgress,
  roleIn,
} from "../domain/permissions";
import { emptyState } from "../domain/progress";
import { defaultSections, starterTemplates } from "../domain/starters";
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
import { memoryImageStore, type ImageStore } from "./imageStore";
import { applyPatch, type ProgressPatch, type Repo } from "./repo";

/** Minimal storage abstraction so the demo store can run on localStorage in the browser and a Map in tests. */
export interface KV {
  get(): string | null;
  set(v: string): void;
}
export const memoryKV = (): KV => {
  let v: string | null = null;
  return { get: () => v, set: (n) => void (v = n) };
};
export const browserKV = (key: string): KV => ({
  get: () => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (v) => localStorage.setItem(key, v),
});

export const DEMO_ME = "demo-you";
export const DEMO_FAMILY = "demo-family";

interface LocalDB {
  v: 1;
  users: (Profile & { timezone?: string })[];
  prefs: Record<ID, Prefs>;
  sections: Record<ID, Section[]>;
  templates: CardTemplate[];
  series: Series[];
  layouts: DayLayout[];
  layoutApplied: string[];
  groups: Group[];
  members: Member[];
  invitations: Invitation[];
  instances: CardInstance[];
  progress: ProgressRecord[];
  placements: Placement[];
  seeded: boolean;
}

const emailOf = (u: Profile) => (u.email ?? "").toLowerCase();

function freshDb(timezone: string): LocalDB {
  return {
    v: 1,
    users: [
      { id: DEMO_ME, name: "You", email: "you@demo.local", demo: true },
      { id: "demo-maja", name: "Maja", email: "maja@demo.local", demo: true },
      { id: "demo-erik", name: "Erik", email: "erik@demo.local", demo: true },
    ],
    prefs: Object.fromEntries(
      [DEMO_ME, "demo-maja", "demo-erik"].map((id) => [id, { timezone, defaultDensity: "compact" as const }]),
    ),
    sections: Object.fromEntries([DEMO_ME, "demo-maja", "demo-erik"].map((id) => [id, defaultSections()])),
    templates: [],
    series: [],
    layouts: [],
    layoutApplied: [],
    groups: [{ id: DEMO_FAMILY, name: "Family", ownerId: DEMO_ME }],
    members: [
      { groupId: DEMO_FAMILY, userId: DEMO_ME, role: "owner" },
      { groupId: DEMO_FAMILY, userId: "demo-maja", role: "editor" },
      { groupId: DEMO_FAMILY, userId: "demo-erik", role: "viewer" },
    ],
    invitations: [],
    instances: [],
    progress: [],
    placements: [],
    seeded: false,
  };
}

/**
 * Demo repository: everything lives in one JSON document (like a tiny server) and is filtered/authorised
 * per acting user. It is NOT real multi-user sharing — "other members" are simulated on this device.
 */
export class LocalRepo implements Repo {
  readonly mode = "demo" as const;
  actingUserId: ID = DEMO_ME;
  private listeners = new Set<() => void>();

  constructor(
    private kv: KV,
    private timezone = "UTC",
    private images: ImageStore = memoryImageStore(),
  ) {}

  // ----- photos: same rule as the database policy — your own uploads, or photos on cards you can see in a group -----
  async putImage(blob: Blob): Promise<string> {
    const path = `${this.me()}/${uid()}.jpg`;
    await this.images.put(path, blob);
    return path;
  }
  async getImageUrl(path: string): Promise<string | null> {
    const db = this.read();
    const me = this.me();
    const mine = path.split("/")[0] === me;
    const sharedWithMe = db.instances.some((i) => i.groupId && roleIn(db.members, i.groupId, me) !== null && i.spec.cover.kind === "upload" && i.spec.cover.path === path);
    if (!mine && !sharedWithMe) return null;
    const blob = await this.images.get(path);
    return blob && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(blob) : null;
  }

  // ----- persistence -----
  read(): LocalDB {
    const raw = this.kv.get();
    if (raw) {
      try {
        const db = JSON.parse(raw) as LocalDB;
        if (db.v === 1) return db;
      } catch {
        /* fall through to fresh */
      }
    }
    const db = freshDb(this.timezone);
    this.kv.set(JSON.stringify(db));
    return db;
  }
  private write(db: LocalDB) {
    this.kv.set(JSON.stringify(db));
    this.listeners.forEach((l) => l());
  }
  private me = () => this.actingUserId;

  get isSeeded() {
    return this.read().seeded;
  }
  markSeeded() {
    const db = this.read();
    db.seeded = true;
    this.write(db);
  }
  reset() {
    this.kv.set(JSON.stringify(freshDb(this.timezone)));
    this.listeners.forEach((l) => l());
  }
  /** Test/demo helper: raw snapshot of the shared document. */
  snapshot() {
    return this.read();
  }

  // ----- workspace -----
  async load(): Promise<Workspace> {
    const db = this.read();
    const me = this.me();
    const meProfile = db.users.find((u) => u.id === me)!;
    const myGroups = db.members.filter((m) => m.userId === me).map((m) => m.groupId);
    const groups = db.groups.filter((g) => myGroups.includes(g.id));
    const members = db.members.filter((m) => myGroups.includes(m.groupId));
    const memberIds = new Set(members.map((m) => m.userId));
    const owned = new Set(groups.filter((g) => g.ownerId === me).map((g) => g.id));
    const myEmail = emailOf(meProfile);
    return {
      me: { id: me, name: meProfile.name, email: meProfile.email, demo: true },
      prefs: db.prefs[me],
      sections: [...(db.sections[me] ?? [])].sort((a, b) => a.position - b.position),
      templates: [...starterTemplates(), ...db.templates.filter((t) => t.ownerId === me)],
      series: db.series.filter((s) => s.ownerId === me),
      layouts: db.layouts.filter((l) => l.ownerId === me),
      groups,
      members,
      profiles: db.users.filter((u) => memberIds.has(u.id) || u.id === me).map(({ id, name, email, demo }) => ({ id, name, email, demo })),
      invitations: db.invitations
        .filter((i) => owned.has(i.groupId) || (i.email.toLowerCase() === myEmail && i.status === "pending"))
        .map((i) => ({ ...i, groupName: db.groups.find((g) => g.id === i.groupId)?.name })),
    };
  }
  async savePrefs(p: Prefs) {
    const db = this.read();
    db.prefs[this.me()] = p;
    this.write(db);
  }
  async saveSections(s: Section[]) {
    const db = this.read();
    db.sections[this.me()] = s;
    this.write(db);
  }

  // ----- library -----
  async upsertTemplate(t: CardTemplate) {
    const db = this.read();
    if (t.ownerId !== this.me()) throw new PermissionError();
    const i = db.templates.findIndex((x) => x.id === t.id);
    if (i >= 0) {
      if (db.templates[i].ownerId !== this.me()) throw new PermissionError();
      db.templates[i] = t;
    } else db.templates.push(t);
    this.write(db);
  }
  async deleteTemplate(id: ID) {
    const db = this.read();
    db.templates = db.templates.filter((t) => !(t.id === id && t.ownerId === this.me()));
    this.write(db);
  }
  async upsertSeries(s: Series, expectedRev?: number) {
    const db = this.read();
    if (s.ownerId !== this.me()) throw new PermissionError();
    const i = db.series.findIndex((x) => x.id === s.id);
    if (i < 0) {
      const created = { ...s, rev: 1 };
      db.series.push(created);
      this.write(db);
      return created;
    }
    if (db.series[i].ownerId !== this.me()) throw new PermissionError();
    if (expectedRev !== undefined && db.series[i].rev !== expectedRev) throw new ConflictError();
    const updated = { ...s, rev: db.series[i].rev + 1 };
    db.series[i] = updated;
    this.write(db);
    return updated;
  }
  async deleteSeries(id: ID) {
    const db = this.read();
    const s = db.series.find((x) => x.id === id);
    if (!s) return;
    if (s.ownerId !== this.me()) throw new PermissionError();
    db.series = db.series.filter((x) => x.id !== id);
    // like ON DELETE SET NULL: history keeps its content, just loses the link
    db.instances.forEach((i) => {
      if (i.seriesId === id) i.seriesId = null;
    });
    this.write(db);
  }
  async upsertLayout(l: DayLayout) {
    const db = this.read();
    if (l.ownerId !== this.me()) throw new PermissionError();
    const i = db.layouts.findIndex((x) => x.id === l.id);
    if (i >= 0) db.layouts[i] = l;
    else db.layouts.push(l);
    this.write(db);
  }
  async deleteLayout(id: ID) {
    const db = this.read();
    db.layouts = db.layouts.filter((l) => !(l.id === id && l.ownerId === this.me()));
    this.write(db);
  }
  async markLayoutApplied(layoutId: ID, date: DateStr) {
    const db = this.read();
    const key = `${this.me()}|${layoutId}|${date}`;
    if (db.layoutApplied.includes(key)) return false;
    db.layoutApplied.push(key);
    this.write(db);
    return true;
  }

  // ----- instances -----
  private visible(db: LocalDB, i: CardInstance) {
    const me = this.me();
    return i.groupId ? roleIn(db.members, i.groupId, me) !== null : i.ownerId === me;
  }
  async loadDay(date: DateStr): Promise<DayData> {
    const db = this.read();
    const me = this.me();
    const instances = db.instances.filter((i) => i.date === date && this.visible(db, i));
    const ids = new Set(instances.map((i) => i.id));
    return {
      instances,
      progress: db.progress.filter((p) => ids.has(p.instanceId)),
      placements: db.placements.filter((p) => p.userId === me && ids.has(p.instanceId)),
    };
  }
  async loadRange(from: DateStr, to: DateStr) {
    const db = this.read();
    const instances = db.instances.filter((i) => i.date >= from && i.date <= to && this.visible(db, i));
    const ids = new Set(instances.map((i) => i.id));
    return { instances, progress: db.progress.filter((p) => ids.has(p.instanceId)) };
  }
  async loadSeriesInstances(seriesId: ID, fromDate?: DateStr) {
    const db = this.read();
    return db.instances.filter(
      (i) => i.seriesId === seriesId && i.ownerId === this.me() && (!fromDate || i.date >= fromDate),
    );
  }
  async createInstance(i: CardInstance, opts?: { ifAbsent?: boolean }) {
    const db = this.read();
    const me = this.me();
    if (i.ownerId !== me) throw new PermissionError();
    if (i.groupId && !canEditRole(roleIn(db.members, i.groupId, me))) throw new PermissionError();
    if (i.seriesId && db.instances.some((x) => x.seriesId === i.seriesId && x.date === i.date)) {
      if (opts?.ifAbsent) return null;
      throw new ConflictError("This routine already has a card on that day.");
    }
    const created = { ...i, rev: 1 };
    db.instances.push(created);
    this.write(db);
    return created;
  }
  async updateInstance(i: CardInstance, expectedRev: number) {
    const db = this.read();
    const me = this.me();
    const idx = db.instances.findIndex((x) => x.id === i.id);
    if (idx < 0) throw new ConflictError("This card no longer exists.");
    const cur = db.instances[idx];
    if (!this.visible(db, cur) || !canEditCard(cur, me, db.members)) throw new PermissionError();
    if (cur.ownerId !== i.ownerId) throw new PermissionError("The owner of a card can't be changed.");
    if (i.groupId !== cur.groupId && !canShareCard(cur, me, i.groupId, db.members)) throw new PermissionError("Only the card's creator can change sharing.");
    if (cur.rev !== expectedRev) throw new ConflictError();
    const updated = { ...i, rev: cur.rev + 1, updatedAt: new Date().toISOString(), updatedBy: me };
    db.instances[idx] = updated;
    this.write(db);
    return updated;
  }
  async deleteInstance(id: ID) {
    const db = this.read();
    const cur = db.instances.find((x) => x.id === id);
    if (!cur) return;
    if (!this.visible(db, cur) || !canEditCard(cur, this.me(), db.members)) throw new PermissionError();
    db.instances = db.instances.filter((x) => x.id !== id);
    db.progress = db.progress.filter((p) => p.instanceId !== id);
    db.placements = db.placements.filter((p) => p.instanceId !== id);
    this.write(db);
  }
  async patchProgress(instanceId: ID, scope: Scope, patch: ProgressPatch) {
    const db = this.read();
    const me = this.me();
    const inst = db.instances.find((x) => x.id === instanceId);
    if (!inst || !this.visible(db, inst) || !canUpdateProgress(inst, me, scope, db.members)) throw new PermissionError();
    let rec = db.progress.find((p) => p.instanceId === instanceId && p.scope === scope);
    if (!rec) {
      rec = { instanceId, scope, state: emptyState(), rev: 0 };
      db.progress.push(rec);
    }
    rec.state = applyPatch(rec.state, patch);
    rec.rev += 1;
    this.write(db);
    return rec;
  }
  async savePlacements(list: Placement[]) {
    const db = this.read();
    const me = this.me();
    for (const p of list) {
      if (p.userId !== me) throw new PermissionError();
      const inst = db.instances.find((x) => x.id === p.instanceId);
      if (!inst || !this.visible(db, inst)) throw new PermissionError();
      const i = db.placements.findIndex((x) => x.instanceId === p.instanceId && x.userId === me);
      if (i >= 0) db.placements[i] = p;
      else db.placements.push(p);
    }
    this.write(db);
  }

  // ----- groups -----
  async createGroup(name: string) {
    const db = this.read();
    const g: Group = { id: uid(), name, ownerId: this.me() };
    db.groups.push(g);
    db.members.push({ groupId: g.id, userId: this.me(), role: "owner" });
    this.write(db);
    return g;
  }
  private requireOwner(db: LocalDB, groupId: ID) {
    if (!canManageGroup(roleIn(db.members, groupId, this.me()))) throw new PermissionError("Only the group owner can do that.");
  }
  async renameGroup(id: ID, name: string) {
    const db = this.read();
    this.requireOwner(db, id);
    db.groups.find((g) => g.id === id)!.name = name;
    this.write(db);
  }
  async deleteGroup(id: ID) {
    const db = this.read();
    this.requireOwner(db, id);
    db.groups = db.groups.filter((g) => g.id !== id);
    db.members = db.members.filter((m) => m.groupId !== id);
    db.invitations = db.invitations.filter((i) => i.groupId !== id);
    db.instances.forEach((i) => {
      if (i.groupId === id) i.groupId = null; // cards fall back to private for their creators
    });
    this.write(db);
  }
  async invite(groupId: ID, email: string, role: Exclude<Role, "owner">) {
    const db = this.read();
    this.requireOwner(db, groupId);
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error("Enter a valid email address.");
    if (db.invitations.some((i) => i.groupId === groupId && i.email === e && i.status === "pending"))
      throw new Error("There is already a pending invitation for that email.");
    const inv: Invitation = { id: uid(), groupId, email: e, role, status: "pending", invitedBy: this.me(), createdAt: new Date().toISOString() };
    db.invitations.push(inv);
    this.write(db);
    return inv;
  }
  async revokeInvitation(id: ID) {
    const db = this.read();
    const inv = db.invitations.find((i) => i.id === id);
    if (!inv) return;
    this.requireOwner(db, inv.groupId);
    if (inv.status === "pending") inv.status = "revoked";
    this.write(db);
  }
  async respondInvitation(id: ID, accept: boolean) {
    const db = this.read();
    const me = db.users.find((u) => u.id === this.me())!;
    const inv = db.invitations.find((i) => i.id === id);
    // Only the intended recipient (matching email) can respond — knowing the id is not enough.
    if (!inv || inv.status !== "pending" || inv.email.toLowerCase() !== emailOf(me)) throw new PermissionError("This invitation isn't addressed to you, or is no longer valid.");
    inv.status = accept ? "accepted" : "declined";
    if (accept && !db.members.some((m) => m.groupId === inv.groupId && m.userId === me.id))
      db.members.push({ groupId: inv.groupId, userId: me.id, role: inv.role });
    this.write(db);
  }
  async setMemberRole(groupId: ID, userId: ID, role: Exclude<Role, "owner">) {
    const db = this.read();
    this.requireOwner(db, groupId);
    const m = db.members.find((x) => x.groupId === groupId && x.userId === userId);
    if (!m || m.role === "owner") throw new PermissionError("The owner's role can't be changed.");
    m.role = role;
    this.write(db);
  }
  async removeMember(groupId: ID, userId: ID) {
    const db = this.read();
    const me = this.me();
    const target = db.members.find((m) => m.groupId === groupId && m.userId === userId);
    if (!target) return;
    if (target.role === "owner") throw new PermissionError("The owner can't leave — delete the group instead.");
    if (userId !== me) this.requireOwner(db, groupId);
    db.members = db.members.filter((m) => m !== target);
    // a departing member takes their shared cards back
    db.instances.forEach((i) => {
      if (i.groupId === groupId && i.ownerId === userId) i.groupId = null;
    });
    this.write(db);
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    const onStorage = () => cb();
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      this.listeners.delete(cb);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  }

  /** Demo only: pretend the invited person accepted (adds a simulated member). */
  async simulateAcceptance(invitationId: ID) {
    const db = this.read();
    const inv = db.invitations.find((i) => i.id === invitationId && i.status === "pending");
    if (!inv) return;
    let user = db.users.find((u) => emailOf(u) === inv.email);
    if (!user) {
      user = { id: "demo-" + uid().slice(0, 8), name: inv.email.split("@")[0], email: inv.email, demo: true };
      db.users.push(user);
      db.prefs[user.id] = db.prefs[DEMO_ME];
      db.sections[user.id] = defaultSections();
    }
    inv.status = "accepted";
    if (!db.members.some((m) => m.groupId === inv.groupId && m.userId === user!.id))
      db.members.push({ groupId: inv.groupId, userId: user.id, role: inv.role });
    this.write(db);
  }
}


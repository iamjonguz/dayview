import type {
  CardInstance,
  CardTemplate,
  DateStr,
  DayData,
  DayLayout,
  Group,
  ID,
  Invitation,
  Placement,
  Prefs,
  ProgressRecord,
  ProgressState,
  Role,
  Scope,
  Section,
  Series,
  Workspace,
} from "../domain/types";

/** Partial, mergeable progress update — lets two people tick different checklist items without overwriting each other. */
export interface ProgressPatch {
  completed?: boolean;
  checks?: Record<ID, boolean>;
  values?: Record<ID, number>;
}

/**
 * The only thing the app knows about persistence. `LocalRepo` (demo, localStorage) and `SupabaseRepo`
 * both implement it; all product logic lives in `Planner`, on top of this interface.
 * Implementations must enforce authorization (RLS in Supabase, `permissions.ts` in the demo).
 */
export interface Repo {
  readonly mode: "demo" | "supabase";
  load(): Promise<Workspace>;
  savePrefs(p: Prefs): Promise<void>;
  saveSections(s: Section[]): Promise<void>;

  upsertTemplate(t: CardTemplate): Promise<void>;
  deleteTemplate(id: ID): Promise<void>;
  /** Insert (expectedRev undefined) or update with optimistic concurrency. Throws ConflictError on a stale rev. */
  upsertSeries(s: Series, expectedRev?: number): Promise<Series>;
  deleteSeries(id: ID): Promise<void>;
  upsertLayout(l: DayLayout): Promise<void>;
  deleteLayout(id: ID): Promise<void>;
  /** Returns false if the layout was already applied to that day for this user. */
  markLayoutApplied(layoutId: ID, date: DateStr): Promise<boolean>;

  loadDay(date: DateStr): Promise<DayData>;
  loadRange(from: DateStr, to: DateStr): Promise<{ instances: CardInstance[]; progress: ProgressRecord[] }>;
  loadSeriesInstances(seriesId: ID, fromDate?: DateStr): Promise<CardInstance[]>;
  /** Creates the instance unless one already exists for (seriesId, date). Returns null when it already existed. */
  createInstance(i: CardInstance, opts?: { ifAbsent?: boolean }): Promise<CardInstance | null>;
  updateInstance(i: CardInstance, expectedRev: number): Promise<CardInstance>;
  deleteInstance(id: ID): Promise<void>;
  patchProgress(instanceId: ID, scope: Scope, patch: ProgressPatch): Promise<ProgressRecord>;
  savePlacements(p: Placement[]): Promise<void>;

  createGroup(name: string): Promise<Group>;
  renameGroup(id: ID, name: string): Promise<void>;
  deleteGroup(id: ID): Promise<void>;
  invite(groupId: ID, email: string, role: Exclude<Role, "owner">): Promise<Invitation>;
  revokeInvitation(id: ID): Promise<void>;
  respondInvitation(id: ID, accept: boolean): Promise<void>;
  setMemberRole(groupId: ID, userId: ID, role: Exclude<Role, "owner">): Promise<void>;
  removeMember(groupId: ID, userId: ID): Promise<void>;

  /** Calls `cb` when data may have changed elsewhere. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
}

export const applyPatch = (s: ProgressState, p: ProgressPatch): ProgressState => ({
  completed: p.completed ?? s.completed,
  checks: { ...s.checks, ...(p.checks ?? {}) },
  values: { ...s.values, ...(p.values ?? {}) },
});

"use client";
import { create } from "zustand";
import { browserTimezone, addDays } from "@/lib/domain/dates";
import { LocalRepo, browserKV, DEMO_ME } from "@/lib/data/local";
import { clearImageCache } from "@/lib/ui/imageCache";
import { indexedDbImageStore } from "@/lib/data/imageStore";
import { Planner, type CreateInput, type EditScope } from "@/lib/data/planner";
import { SupabaseRepo } from "@/lib/data/supabase";
import { seedDemo } from "@/lib/data/seed";
import type { Repo, ProgressPatch } from "@/lib/data/repo";
import { buildDayView, type DayCard, type DayView } from "@/lib/domain/dayview";
import { emptyState } from "@/lib/domain/progress";
import { scopeFor } from "@/lib/domain/permissions";
import { ConflictError, PermissionError, type CardInstance, type CardSpec, type CompletionMode, type DateStr, type DayData, type ID, type Recurrence, type Workspace } from "@/lib/domain/types";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
  action?: { label: string; run: () => void | Promise<void> };
}

type Phase = "booting" | "needs-auth" | "recovery" | "ready" | "error";

interface AppState {
  phase: Phase;
  mode: "demo" | "supabase";
  fatal?: string;
  planner: Planner | null;
  ws: Workspace | null;
  date: DateStr;
  data: DayData | null;
  view: DayView | null;
  dayLoading: boolean;
  dayError?: string;
  toasts: Toast[];
  /** Demo only: which simulated member we are acting as. */
  actor: ID;

  boot(): Promise<void>;
  bootInner(): Promise<void>;
  signOut(): Promise<void>;
  /** Finishes a password reset: sets the new password, then opens the app. */
  finishRecovery(password: string): Promise<string | null>;
  setDate(d: DateStr): Promise<void>;
  shiftDate(n: number): Promise<void>;
  refresh(opts?: { silent?: boolean }): Promise<void>;
  toast(message: string, opts?: { kind?: Toast["kind"]; action?: Toast["action"] }): void;
  dismissToast(id: number): void;
  /** Runs a mutation with visible error handling, then reloads the day. */
  act<T>(fn: (p: Planner) => Promise<T>, opts?: { done?: string; undo?: (r: T) => Promise<void>; refreshAll?: boolean }): Promise<{ ok: boolean; value?: T; error?: unknown }>;

  createCard(input: CreateInput): Promise<boolean>;
  saveCard(inst: CardInstance, patch: { spec: CardSpec; groupId?: ID | null; completionMode?: CompletionMode; rule?: Omit<Recurrence, "start"> }, scope: EditScope): Promise<{ ok: boolean; conflict?: boolean }>;
  patchProgress(card: DayCard, patch: ProgressPatch): Promise<void>;
  reorder(layout: { sectionId: ID | null; ids: ID[] }[]): Promise<void>;
  setViewDensity(d: "compact" | "comfortable"): Promise<void>;
  setDemoActor(id: ID): Promise<void>;
  resetDemo(): Promise<void>;
}

const ACTOR_KEY = "dayview.demo.actor";
const DB_KEY = "dayview.demo.v1";
let toastId = 1;
let dayReq = 0;
let unsub: (() => void) | undefined;
let bootInFlight: Promise<void> | null = null;

export const useApp = create<AppState>((set, get) => {
  const rebuild = (data: DayData): DayView => {
    const { planner } = get();
    return planner!.view(data);
  };

  // A password-reset link signs the person in with a short "recovery" session. They must choose a new password
  // before entering the app, so we hold the app back until they have.
  let recovering = false;
  let recoveryWatched = false;
  function watchRecovery(sb: NonNullable<ReturnType<typeof getSupabase>>) {
    if (typeof window !== "undefined" && /type=recovery/.test(window.location.hash)) recovering = true;
    if (recoveryWatched) return;
    recoveryWatched = true;
    sb.auth.onAuthStateChange((evt) => {
      if (evt === "PASSWORD_RECOVERY") {
        recovering = true;
        set({ phase: "recovery" });
      }
    });
  }

  async function makeRepo(): Promise<Repo | "needs-auth"> {
    if (supabaseConfigured) {
      const sb = getSupabase()!;
      watchRecovery(sb);
      const { data } = await sb.auth.getSession();
      if (!data.session) return "needs-auth";
      return new SupabaseRepo(sb);
    }
    const repo = new LocalRepo(browserKV(DB_KEY), browserTimezone(), indexedDbImageStore());
    try {
      const a = localStorage.getItem(ACTOR_KEY);
      if (a && repo.read().users.some((u) => u.id === a)) repo.actingUserId = a;
    } catch {}
    return repo;
  }

  return {
    phase: "booting",
    mode: supabaseConfigured ? "supabase" : "demo",
    planner: null,
    ws: null,
    date: "",
    data: null,
    view: null,
    dayLoading: false,
    toasts: [],
    actor: DEMO_ME,

    boot() {
      // single-flight: StrictMode / repeated effects must not run two boots (and two demo seeds) at once
      if (bootInFlight) return bootInFlight;
      bootInFlight = get().bootInner().finally(() => (bootInFlight = null));
      return bootInFlight;
    },

    async bootInner() {
      try {
        const repo = await makeRepo();
        if (recovering) {
          set({ phase: "recovery" });
          return;
        }
        if (repo === "needs-auth") {
          set({ phase: "needs-auth" });
          getSupabase()!.auth.onAuthStateChange((evt) => {
            if (evt === "SIGNED_IN" && get().phase === "needs-auth") void get().boot();
            if (evt === "SIGNED_OUT") {
              unsub?.();
              set({ phase: "needs-auth", planner: null, ws: null, data: null, view: null });
            }
          });
          return;
        }
        if (repo instanceof LocalRepo && !repo.isSeeded) {
          const seeder = new Planner(repo);
          await seeder.init();
          await seedDemo(seeder);
          repo.markSeeded();
        }
        const planner = new Planner(repo);
        await planner.init();
        unsub?.();
        let t: ReturnType<typeof setTimeout> | undefined;
        const soft = () => {
          clearTimeout(t);
          t = setTimeout(() => void get().refresh({ silent: true, }), 200);
        };
        const unsubRepo = repo.subscribe(soft);
        const onFocus = () => soft();
        window.addEventListener("focus", onFocus);
        const poll = repo.mode === "supabase" ? setInterval(soft, 45_000) : undefined; // reliable-refresh fallback
        unsub = () => {
          unsubRepo();
          window.removeEventListener("focus", onFocus);
          if (poll) clearInterval(poll);
        };
        const date = get().date || planner.today();
        set({ planner, ws: { ...planner.ws }, phase: "ready", date, actor: planner.me.id });
        await get().refresh();
      } catch (e) {
        set({ phase: "error", fatal: e instanceof Error ? e.message : String(e) });
      }
    },

    async finishRecovery(password) {
      const { error } = await getSupabase()!.auth.updateUser({ password });
      if (error) return error.message;
      recovering = false;
      if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
      await get().boot();
      return null;
    },
    async signOut() {
      await getSupabase()?.auth.signOut();
    },

    async setDate(d) {
      set({ date: d });
      await get().refresh();
    },
    async shiftDate(n) {
      await get().setDate(addDays(get().date, n));
    },

    async refresh(opts) {
      const { planner, date } = get();
      if (!planner) return;
      const req = ++dayReq;
      if (!opts?.silent) set({ dayLoading: true, dayError: undefined });
      try {
        const ws = await planner.repo.load();
        planner.ws = ws;
        const data = await planner.loadDay(date);
        if (req !== dayReq) return; // a newer request superseded this one
        set({ ws: { ...ws }, data, view: planner.view(data), dayLoading: false, dayError: undefined });
      } catch (e) {
        if (req !== dayReq) return;
        const msg = e instanceof Error ? e.message : "Couldn't load this day.";
        set({ dayLoading: false, dayError: msg });
      }
    },

    toast(message, opts) {
      const id = toastId++;
      set((s) => ({ toasts: [...s.toasts, { id, message, kind: opts?.kind ?? "info", action: opts?.action }].slice(-3) }));
      setTimeout(() => get().dismissToast(id), opts?.kind === "error" ? 9000 : opts?.action ? 8000 : 4000);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    async act(fn, opts) {
      const { planner } = get();
      if (!planner) return { ok: false };
      try {
        const value = await fn(planner);
        await get().refresh({ silent: true });
        if (opts?.done || opts?.undo) {
          get().toast(opts.done ?? "Done", {
            action: opts.undo
              ? {
                  label: "Undo",
                  run: async () => {
                    try {
                      await opts.undo!(value);
                      await get().refresh({ silent: true });
                    } catch (e) {
                      get().toast(e instanceof Error ? `Couldn't undo: ${e.message}` : "Couldn't undo", { kind: "error" });
                    }
                  },
                }
              : undefined,
          });
        }
        return { ok: true, value };
      } catch (error) {
        const conflict = error instanceof ConflictError;
        get().toast(
          conflict
            ? "This was changed somewhere else, so your change wasn't saved. The latest version is shown."
            : error instanceof PermissionError
              ? error.message
              : `Couldn't save: ${error instanceof Error ? error.message : "unknown error"}`,
          { kind: "error" },
        );
        await get().refresh({ silent: true });
        return { ok: false, error };
      }
    },

    async createCard(input) {
      const r = await get().act((p) => p.createCard(input));
      if (r.ok) {
        if (r.value === null) get().toast("Routine saved. It will appear on its next scheduled day.");
        else get().toast(input.recurrence ? "Routine created" : "Card added");
      }
      return r.ok;
    },

    async saveCard(inst, patch, scope) {
      const { planner } = get();
      if (!planner) return { ok: false };
      try {
        await planner.updateCard(inst, patch, scope);
        await get().refresh({ silent: true });
        return { ok: true };
      } catch (e) {
        await get().refresh({ silent: true });
        if (e instanceof ConflictError) return { ok: false, conflict: true };
        get().toast(e instanceof Error ? e.message : "Couldn't save", { kind: "error" });
        return { ok: false };
      }
    },

    /** Optimistic: update the UI instantly, roll back with a visible error if saving fails. */
    async patchProgress(card, patch) {
      const { planner, data } = get();
      if (!planner || !data) return;
      const inst = card.instance;
      const scope = scopeFor(inst, planner.me.id);
      const prev = data;
      const cur = data.progress.find((p) => p.instanceId === inst.id && p.scope === scope);
      const base = cur?.state ?? emptyState();
      const state = { completed: patch.completed ?? base.completed, checks: { ...base.checks, ...patch.checks }, values: { ...base.values, ...patch.values } };
      const progress = cur
        ? data.progress.map((p) => (p === cur ? { ...p, state } : p))
        : [...data.progress, { instanceId: inst.id, scope, state, rev: 0 }];
      const next = { ...data, progress };
      set({ data: next, view: rebuild(next) });
      try {
        await planner.patchProgress(inst, patch);
        void get().refresh({ silent: true });
      } catch (e) {
        set({ data: prev, view: rebuild(prev) });
        get().toast(e instanceof PermissionError ? e.message : "Couldn't save your progress. Your change was undone.", { kind: "error" });
      }
    },

    async reorder(layout) {
      const { planner, data, date } = get();
      if (!planner || !data) return;
      const prev = data;
      const mine = new Map(data.placements.map((p) => [p.instanceId, p]));
      const placements = [...mine.values()].filter((p) => !layout.some((g) => g.ids.includes(p.instanceId)));
      for (const g of layout)
        g.ids.forEach((id, position) => placements.push({ instanceId: id, userId: planner.me.id, sectionId: g.sectionId, position, hidden: mine.get(id)?.hidden ?? false, density: mine.get(id)?.density }));
      const next = { ...data, placements };
      set({ data: next, view: rebuild(next) });
      try {
        await planner.saveDayOrder(date, layout, data.placements);
        void get().refresh({ silent: true });
      } catch {
        set({ data: prev, view: rebuild(prev) });
        get().toast("Couldn't save the new order. It was put back.", { kind: "error" });
      }
    },

    /** The day-view size preference (persisted in the user's preferences). Optimistic. */
    async setViewDensity(d) {
      const { planner, ws, data } = get();
      if (!planner || !ws || ws.prefs.defaultDensity === d) return;
      const prev = ws.prefs;
      const prefs = { ...prev, defaultDensity: d };
      planner.ws = { ...planner.ws, prefs };
      set({ ws: { ...ws, prefs }, view: data ? planner.view(data) : get().view });
      try {
        await planner.savePrefs(prefs);
      } catch {
        planner.ws = { ...planner.ws, prefs: prev };
        set({ ws: { ...ws, prefs: prev }, view: data ? planner.view(data) : get().view });
        get().toast("Couldn’t save your view preference.", { kind: "error" });
      }
    },

    async setDemoActor(id) {
      try {
        localStorage.setItem(ACTOR_KEY, id);
      } catch {}
      unsub?.();
      clearImageCache();
      set({ phase: "booting", data: null, view: null });
      await get().boot();
    },
    async resetDemo() {
      const { planner } = get();
      if (planner?.repo instanceof LocalRepo) {
        planner.repo.reset();
        try {
          localStorage.removeItem(ACTOR_KEY);
        } catch {}
        unsub?.();
        set({ phase: "booting", data: null, view: null, date: "" });
        await get().boot();
      }
    },
  };
});

// keep unused-import linter quiet for helpers used only in types
void buildDayView;

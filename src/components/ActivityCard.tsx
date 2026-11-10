"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Copy,
  EyeOff,
  FastForward,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat2,
  Undo2,
  Users,
  Minus,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DayCard } from "@/lib/domain/dayview";
import { formatTimeRange } from "@/lib/domain/dates";
import { newBlock, uid } from "@/lib/domain/factory";
import { fmtNum, isTracking, blockFraction, blockComplete } from "@/lib/domain/progress";
import type { ChecklistBlock, ID, ProgressBlock, ResponsibilityBlock, Section, Workspace } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { CoverBackground, hasImage, ProgressBar, RichText } from "./bits";
import { IconButton, inputCls } from "./ui";

export type MoveRequest = { dir?: -1 | 1; sectionId?: ID | null };

interface Props {
  card: DayCard;
  ws: Workspace;
  sections: Section[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: (c: DayCard) => void;
  onDelete: (c: DayCard) => void;
  onMove: (c: DayCard, m: MoveRequest) => void;
}

const FLIP_OUT_MS = 150;

export function ActivityCard(props: Props) {
  const [face, setFace] = useState<"front" | "back">("front");
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const flipBtnRef = useRef<HTMLButtonElement>(null);
  const topBefore = useRef<number | null>(null);
  const refocus = useRef(false);

  const flip = useCallback(() => {
    if (phase !== "idle") return;
    topBefore.current = rootRef.current?.getBoundingClientRect().top ?? null;
    setPhase("out");
  }, [phase]);

  // phase machine: out → swap face → in → idle. Only one face is ever in the DOM, so the hidden face
  // can't be focused or read by assistive tech.
  useEffect(() => {
    if (phase === "out") {
      const t = setTimeout(() => {
        refocus.current = true;
        setFace((f) => (f === "front" ? "back" : "front"));
        setPhase("in");
      }, FLIP_OUT_MS);
      return () => clearTimeout(t);
    }
    if (phase === "in") {
      const t = setTimeout(() => setPhase("idle"), 200);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // keep the user's place: the card's top edge stays where it was; move focus to the control that replaced the one they used
  useLayoutEffect(() => {
    if (phase !== "in" || !refocus.current) return;
    refocus.current = false;
    const el = rootRef.current;
    if (el && topBefore.current !== null) {
      const delta = el.getBoundingClientRect().top - topBefore.current;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
      const r = el.getBoundingClientRect();
      if (face === "back" && r.top < 56) window.scrollBy({ top: r.top - 72, behavior: "instant" as ScrollBehavior });
    }
    flipBtnRef.current?.focus({ preventScroll: true });
  }, [phase, face]);

  return (
    <div ref={rootRef} className={clsx("[transform-style:flat]", phase === "out" && "flip-out", phase === "in" && "flip-in")}>
      {face === "front" ? <Front {...props} flipRef={flipBtnRef} onFlip={flip} /> : <Back {...props} flipRef={flipBtnRef} onFlip={flip} />}
    </div>
  );
}

/* ------------------------------------------------------------------ completion control */
function Ring({ fraction, complete, size = 30, accent }: { fraction: number; complete: boolean; size?: number; accent: string }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill={complete ? accent : "rgba(0,0,0,.25)"} stroke="rgba(245,237,224,.75)" strokeWidth="2" />
        {!complete && fraction > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth="3" strokeDasharray={`${c * fraction} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      {complete && <Check size={size * 0.6} strokeWidth={3} className="absolute inset-0 m-auto text-amber-ink" />}
    </span>
  );
}

function CompletionControl({ card, title }: { card: DayCard; title: string }) {
  const patch = useApp((s) => s.patchProgress);
  const derived = card.instance.spec.completion.mode === "derived";
  const accent = card.instance.spec.accent;
  const { complete, fraction } = card.progress;
  if (derived || !card.canProgress) {
    const why = derived ? "Completes automatically from its checklist and targets" : "Only editors can change this shared card's completion";
    return (
      <span className="grid size-11 shrink-0 place-items-center" role="img" aria-label={`${complete ? "Complete" : "Not complete"}. ${why}`} title={why}>
        <Ring fraction={fraction} complete={complete} accent={accent} />
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={complete}
      aria-label={`Mark ${title} ${complete ? "not done" : "done"}`}
      onClick={() => void patch(card, { completed: !complete })}
      className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
    >
      <Ring fraction={0} complete={complete} accent={accent} />
    </button>
  );
}

/* ------------------------------------------------------------------ front */
function GroupBadge({ card, ws }: { card: DayCard; ws: Workspace }) {
  const g = ws.groups.find((x) => x.id === card.instance.groupId);
  if (!g) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium text-ivory backdrop-blur-sm">
      <Users size={12} aria-hidden /> {g.name}
    </span>
  );
}

function Front({ card, ws, onFlip, flipRef }: Props & { onFlip: () => void; flipRef: React.RefObject<HTMLButtonElement | null> }) {
  const { spec } = card.instance;
  const compact = card.density === "compact";
  const img = hasImage(spec.cover);
  const time = spec.front.showTime ? formatTimeRange(spec.time, spec.endTime) : "";
  const summary = spec.front.showSummary ? spec.summary : "";
  const showProg = spec.front.showProgress && card.progress.hasTracking;
  const metaCompact = [time, showProg ? card.progress.label : summary].filter(Boolean).join(" · ");
  return (
    <article aria-label={spec.title} className={clsx("relative isolate overflow-hidden rounded-3xl border border-line shadow-lg shadow-black/30", compact ? "min-h-[88px]" : "min-h-[172px] md:min-h-[190px]")}>
      <CoverBackground cover={spec.cover} accent={spec.accent} />
      {img && <div aria-hidden className="cover-scrim absolute inset-0" />}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: spec.accent, opacity: 0.8 }} />
      <div className={clsx("relative flex h-full gap-1 p-3 pl-4", compact ? "items-center" : "min-h-[inherit] flex-col justify-between")}>
        {!compact && (
          <div className="flex min-h-8 items-start justify-between">
            <GroupBadge card={card} ws={ws} />
            <span />
          </div>
        )}
        <div className="flex items-center gap-2">
          <CompletionControl card={card} title={spec.title} />
          <div className="min-w-0 flex-1 py-1">
            {compact && card.instance.groupId && <GroupBadge card={card} ws={ws} />}
            <h3 className={clsx("truncate font-serif leading-tight text-ivory text-shadow-soft", compact ? "text-xl" : "text-[26px]")}>{spec.title || "Untitled"}</h3>
            {compact ? (
              metaCompact && <p className="truncate text-sm text-ivory/85 text-shadow-soft">{metaCompact}</p>
            ) : (
              <>
                {time && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-ivory/90 text-shadow-soft">
                    <Clock size={14} aria-hidden /> {time}
                  </p>
                )}
                {summary && <p className="truncate text-[15px] text-ivory/90 text-shadow-soft">{summary}</p>}
                {showProg && (
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar fraction={card.progress.fraction} label={`${spec.title} progress`} accent={spec.accent} className="max-w-[260px] flex-1" />
                    <span className="text-sm text-ivory/90 text-shadow-soft">{card.progress.label}</span>
                  </div>
                )}
              </>
            )}
          </div>
          <IconButton ref={flipRef} label={`Open details for ${spec.title || "card"}`} aria-expanded={false} bare className="bg-black/35 backdrop-blur-sm" onClick={onFlip}>
            <Repeat2 size={20} />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ back */
const Label = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-amber">{children}</h4>;

function Back({ card, ws, sections, canMoveUp, canMoveDown, onEdit, onDelete, onMove, onFlip, flipRef }: Props & { onFlip: () => void; flipRef: React.RefObject<HTMLButtonElement | null> }) {
  const { instance: inst } = card;
  const { spec } = inst;
  const act = useApp((s) => s.act);
  const patch = useApp((s) => s.patchProgress);
  const saveCard = useApp((s) => s.saveCard);
  const time = formatTimeRange(spec.time, spec.endTime);
  const group = ws.groups.find((g) => g.id === inst.groupId);
  const derived = spec.completion.mode === "derived";
  const nameOf = (id: ID | null) => ws.profiles.find((p) => p.id === id)?.name ?? "Unassigned";
  const rule = ws.series.find((s) => s.id === inst.seriesId);

  const editSpec = (fn: (blocks: typeof spec.blocks) => typeof spec.blocks) => saveCard(inst, { spec: { ...spec, blocks: fn(spec.blocks) } }, "this");

  return (
    <article aria-label={`${spec.title} details`} className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-[#2e2720] to-[#221d18] p-5 pt-4 shadow-lg shadow-black/30">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: spec.accent, opacity: 0.8 }} />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-[28px] leading-tight">{spec.title || "Untitled"}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted">
            {time && (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} aria-hidden /> {time}
              </span>
            )}
            {group && (
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} aria-hidden /> {group.name} · {inst.completionMode === "together" ? "complete together" : "each person completes"}
              </span>
            )}
            {rule && (
              <span className="inline-flex items-center gap-1.5">
                <Repeat2 size={14} aria-hidden /> Routine
              </span>
            )}
          </p>
        </div>
        <IconButton ref={flipRef} label={`Close details for ${spec.title || "card"}`} aria-expanded={true} variant="outline" onClick={onFlip}>
          <Undo2 size={20} />
        </IconButton>
      </header>

      {card.progress.hasTracking && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm text-ivory">
            <span className="font-medium" style={{ color: spec.accent }}>{card.progress.label}</span>
            <span className="text-muted">{card.progress.complete ? "Complete" : derived ? "Completes automatically" : ""}</span>
          </div>
          <ProgressBar fraction={card.progress.fraction} label={`${spec.title} progress`} accent={spec.accent} />
        </div>
      )}
      {spec.summary && <p className="mt-3 text-[15px] text-ivory/90">{spec.summary}</p>}

      <div className="mt-4 space-y-5">
        {spec.blocks.length === 0 && <p className="text-[15px] text-muted">No content yet. Use Edit to add notes, a checklist or a target.</p>}
        {spec.blocks.map((b) => {
          if (b.type === "note")
            return (
              <section key={b.id}>
                <Label>{b.title || "Notes"}</Label>
                {b.text.trim() ? <RichText text={b.text} /> : <p className="text-sm text-muted">Empty note</p>}
              </section>
            );
          if (b.type === "checklist")
            return (
              <ChecklistView key={b.id} block={b} card={card} onToggle={(itemId, v) => void patch(card, { checks: { [itemId]: v } })} onAdd={card.canEdit ? (text) => void editSpec((bl) => bl.map((x) => (x.id === b.id && x.type === "checklist" ? { ...x, items: [...x.items, { id: uid(), text }] } : x))) : undefined} />
            );
          if (b.type === "progress") return <ProgressView key={b.id} block={b} card={card} onSet={(v) => void patch(card, { values: { [b.id]: Math.max(0, v) } })} />;
          return <ResponsibilityView key={b.id} block={b} card={card} ws={ws} nameOf={nameOf} onAssign={(aid, uidv) => void editSpec((bl) => bl.map((x) => (x.id === b.id && x.type === "responsibility" ? { ...x, assignments: x.assignments.map((a) => (a.id === aid ? { ...a, userId: uidv } : a)) } : x)))} />;
        })}
      </div>

      {card.others.length > 0 && (
        <section className="mt-5">
          <Label>Everyone’s progress</Label>
          <ul className="flex flex-wrap gap-2 text-sm">
            {card.others.map((o) => (
              <li key={o.userId} className="rounded-full border border-line px-3 py-1">
                {nameOf(o.userId)}: {o.complete ? "done" : "not yet"}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!card.canProgress && group && <p className="mt-4 text-sm text-muted">Only editors can update this shared card’s completion.</p>}

      <footer className="mt-6 flex flex-wrap items-center gap-2">
        {card.canEdit && (
          <button type="button" onClick={() => onEdit(card)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber/70 px-4 text-[15px] font-medium text-amber hover:bg-amber/10">
            <Pencil size={16} aria-hidden /> Edit
          </button>
        )}
        {!derived && card.canProgress && (
          <button
            type="button"
            onClick={() => void patch(card, { completed: !card.progress.complete })}
            className={clsx("inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold sm:flex-none", card.progress.complete ? "border border-line text-ivory hover:bg-surface-2" : "bg-amber text-amber-ink hover:brightness-110")}
          >
            <Check size={16} aria-hidden /> {card.progress.complete ? "Mark not done" : "Mark done"}
          </button>
        )}
        <div className="ml-auto">
          <Menu.Root>
            <Menu.Trigger asChild>
              <IconButton label={`More actions for ${spec.title}`} variant="outline">
                <MoreHorizontal size={20} />
              </IconButton>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-2xl border border-line bg-surface-2 p-1.5 text-[15px] shadow-2xl">
                {card.canEdit && <Item icon={<Pencil size={16} />} onSelect={() => onEdit(card)}>Edit…</Item>}
                <Item icon={<Copy size={16} />} onSelect={() => void act((p) => p.duplicateCard(inst), { done: "Card duplicated" })}>Duplicate</Item>
                {card.canEdit && (
                  <Item
                    icon={<FastForward size={16} />}
                    onSelect={() =>
                      void act((p) => p.setSkipped(inst.id, inst.date, true), {
                        done: `Skipped “${spec.title}” for this day`,
                        undo: () => useApp.getState().planner!.setSkipped(inst.id, inst.date, false),
                      })
                    }
                  >
                    Skip this day
                  </Item>
                )}
                <Menu.Separator className="my-1 h-px bg-line" />
                <Item icon={<ArrowUp size={16} />} disabled={!canMoveUp} onSelect={() => onMove(card, { dir: -1 })}>Move up</Item>
                <Item icon={<ArrowDown size={16} />} disabled={!canMoveDown} onSelect={() => onMove(card, { dir: 1 })}>Move down</Item>
                <Menu.Sub>
                  <Menu.SubTrigger className="flex min-h-10 cursor-default items-center gap-2 rounded-xl px-3 outline-none data-[highlighted]:bg-white/10">
                    <span className="size-4" /> Move to section…
                  </Menu.SubTrigger>
                  <Menu.Portal>
                    <Menu.SubContent className="z-50 min-w-44 rounded-2xl border border-line bg-surface-2 p-1.5 shadow-2xl">
                      <Item onSelect={() => onMove(card, { sectionId: null })} disabled={card.placement.sectionId === null}>Anytime</Item>
                      {sections.map((s) => (
                        <Item key={s.id} onSelect={() => onMove(card, { sectionId: s.id })} disabled={card.placement.sectionId === s.id}>{s.name}</Item>
                      ))}
                    </Menu.SubContent>
                  </Menu.Portal>
                </Menu.Sub>
                <Menu.Separator className="my-1 h-px bg-line" />
                <Item icon={card.density === "compact" ? <Maximize2 size={16} /> : <Minimize2 size={16} />} onSelect={() => void act((p) => p.setPlacementFlags(inst, { density: card.density === "compact" ? "comfortable" : "compact" }))}>
                  {card.density === "compact" ? "Show comfortable (just for me)" : "Show compact (just for me)"}
                </Item>
                <Item icon={<EyeOff size={16} />} onSelect={() => void act((p) => p.setPlacementFlags(inst, { hidden: true }), { done: "Hidden from your day", undo: () => useApp.getState().planner!.setPlacementFlags(inst, { hidden: false }) })}>Hide from my day</Item>
                {card.canEdit && (
                  <>
                    <Menu.Separator className="my-1 h-px bg-line" />
                    <Item danger onSelect={() => onDelete(card)}>Delete…</Item>
                  </>
                )}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </footer>
    </article>
  );
}

function Item({ children, icon, onSelect, disabled, danger }: { children: React.ReactNode; icon?: React.ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Menu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={clsx("flex min-h-10 cursor-default items-center gap-2 rounded-xl px-3 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-white/10", danger && "text-danger")}
    >
      <span className="grid size-4 place-items-center" aria-hidden>{icon}</span>
      {children}
    </Menu.Item>
  );
}

/* ------------------------------------------------------------------ blocks */
function ChecklistView({ block, card, onToggle, onAdd }: { block: ChecklistBlock; card: DayCard; onToggle: (id: ID, v: boolean) => void; onAdd?: (text: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const accent = card.instance.spec.accent;
  const done = block.items.filter((i) => card.state.checks[i.id]).length;
  const submit = () => {
    if (text.trim()) onAdd?.(text.trim());
    setText("");
    setAdding(false);
  };
  return (
    <section>
      <Label>
        {block.title || "Checklist"} <span className="ml-1 font-normal normal-case tracking-normal text-muted">{done}/{block.items.length}</span>
      </Label>
      <ul>
        {block.items.map((it) => {
          const on = !!card.state.checks[it.id];
          return (
            <li key={it.id} className="border-b border-line/70 last:border-0">
              <label className={clsx("flex min-h-11 items-center gap-3 py-1", card.canProgress ? "cursor-pointer" : "opacity-80")}>
                <input type="checkbox" checked={on} disabled={!card.canProgress} onChange={(e) => onToggle(it.id, e.target.checked)} className="peer sr-only" />
                <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-ivory/60 peer-checked:border-transparent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-amber" style={on ? { background: accent } : undefined}>
                  {on && <Check size={14} strokeWidth={3} className="text-amber-ink" />}
                </span>
                <span className={clsx("text-[16px]", on && "text-muted line-through decoration-muted/60")}>{it.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {onAdd &&
        (adding ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} placeholder="New item" aria-label={`New item for ${block.title}`} className={inputCls} />
            <button type="submit" className="min-h-11 rounded-xl bg-amber px-4 font-semibold text-amber-ink">Add</button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] hover:bg-surface-2">
            <Plus size={16} aria-hidden /> Add {block.noun ? block.noun.replace(/s$/, "") : "item"}
          </button>
        ))}
    </section>
  );
}

function ProgressView({ block, card, onSet }: { block: ProgressBlock; card: DayCard; onSet: (v: number) => void }) {
  const value = card.state.values[block.id] ?? 0;
  const [draft, setDraft] = useState<string | null>(null);
  const accent = card.instance.spec.accent;
  const complete = blockComplete(block, card.state);
  return (
    <section>
      <Label>{block.title || "Progress"}</Label>
      <div className="flex items-center gap-2">
        <IconButton label={`Decrease ${block.title} by ${fmtNum(block.step)}`} disabled={!card.canProgress || value <= 0} onClick={() => onSet(value - block.step)}>
          <Minus size={18} />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-lg">
          <input
            aria-label={`${block.title} value`}
            inputMode="decimal"
            disabled={!card.canProgress}
            value={draft ?? fmtNum(value)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null) {
                const n = Number(draft.replace(",", "."));
                if (Number.isFinite(n)) onSet(n);
                setDraft(null);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-20 rounded-lg border border-line bg-bg px-2 py-1.5 text-center"
          />
          <span className="text-muted">of {fmtNum(block.target)} {block.unit}</span>
        </div>
        <button type="button" disabled={!card.canProgress} onClick={() => onSet(value + block.step)} aria-label={`Increase ${block.title} by ${fmtNum(block.step)}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-amber px-4 font-semibold text-amber-ink hover:brightness-110 disabled:opacity-40">
          <Plus size={16} aria-hidden /> {fmtNum(block.step)}
        </button>
      </div>
      <ProgressBar className="mt-2" fraction={blockFraction(block, card.state)} label={`${block.title} progress`} accent={accent} />
      {complete && <p className="mt-1 text-sm text-muted">Target reached{value > block.target ? ` — ${fmtNum(value)} ${block.unit} so far` : ""}.</p>}
    </section>
  );
}

function ResponsibilityView({ block, card, ws, nameOf, onAssign }: { block: ResponsibilityBlock; card: DayCard; ws: Workspace; nameOf: (id: ID | null) => string; onAssign: (aid: ID, userId: ID | null) => void }) {
  const members = ws.members.filter((m) => m.groupId === card.instance.groupId);
  const canAssign = card.canEdit && !!card.instance.groupId;
  return (
    <section>
      <Label>{block.title || "Responsibilities"}</Label>
      <ul className="space-y-1">
        {block.assignments.map((a) => (
          <li key={a.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 last:border-0">
            <span>{a.label}</span>
            {canAssign ? (
              <select aria-label={`Who: ${a.label}`} value={a.userId ?? ""} onChange={(e) => onAssign(a.id, e.target.value || null)} className="min-h-10 rounded-lg border border-line bg-bg px-2 text-[15px]">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{nameOf(m.userId)}</option>
                ))}
              </select>
            ) : (
              <span className="text-amber">{nameOf(a.userId)}</span>
            )}
          </li>
        ))}
      </ul>
      {!card.instance.groupId && <p className="mt-1 text-xs text-muted">Share this card with a group to assign people.</p>}
    </section>
  );
}

void newBlock;
void isTracking;

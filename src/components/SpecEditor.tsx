"use client";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Bold, Check, ChevronDown, CircleHelp, Italic, List, ListChecks, Plus, StickyNote, Target, Trash2, Users, X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { ACCENTS, addBlock, uid } from "@/lib/domain/factory";
import { frontBlocks, relevantBlocks, trackingBlocks } from "@/lib/domain/progress";
import type { Block, BlockType, CardSpec, ID } from "@/lib/domain/types";
import { CardPreview } from "./CardPreview";
import { CoverPicker } from "./CoverPicker";
import { COVER_PRESETS } from "@/lib/ui/covers";
import { ACTIVITY_ICONS, ICON_KEYS, activityIconKey } from "@/lib/ui/activity";
import { ChecklistEditor } from "./ChecklistEditor";
import { Button, Field, IconButton, Segmented, inputCls } from "./ui";

const BLOCK_META: Record<BlockType, { label: string; icon: ReactNode }> = {
  note: { label: "Notes", icon: <StickyNote size={16} /> },
  checklist: { label: "Checklist", icon: <ListChecks size={16} /> },
  progress: { label: "Numeric target", icon: <Target size={16} /> },
  responsibility: { label: "Responsibilities", icon: <Users size={16} /> },
};

/** A titled editor section. Not collapsible: used for the things people edit every time. */
function Group({ title, children, help }: { title: string; children: ReactNode; help?: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1 text-[17px] font-semibold">{title}{help}</h3>
      {children}
    </section>
  );
}

/** Progressive disclosure for advanced options. The summary shows the current choice so closed sections still inform. */
export function Disclosure({ title, summary, children, defaultOpen }: { title: string; summary?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line bg-bg/40">
      <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2">
        <span className="text-[17px] font-semibold">{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-right text-[15px] text-muted">{summary}</span>}
        <ChevronDown size={18} className={clsx("shrink-0 text-muted transition-transform group-open:rotate-180", !summary && "ml-auto")} aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

/** Contextual help: detailed guidance stays out of the way until asked for. */
export function Help({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-11 place-items-center rounded-full text-muted hover:text-fg"><CircleHelp size={18} aria-hidden /></button>
      {open && <p role="note" className="basis-full rounded-lg bg-surface-2 px-3 py-2 text-[15px] font-normal leading-snug text-muted">{children}</p>}
    </>
  );
}

export function SpecEditor({ spec, onChange, groupId = null }: { spec: CardSpec; onChange: (s: CardSpec) => void; groupId?: ID | null }) {
  const id = useId();
  const set = (p: Partial<CardSpec>) => onChange({ ...spec, ...p });
  const setBlock = (b: Block) => set({ blocks: spec.blocks.map((x) => (x.id === b.id ? b : x)) });
  const moveBlock = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= spec.blocks.length) return;
    const blocks = [...spec.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    set({ blocks });
  };
  const removeBlock = (b: Block) => {
    const completion = spec.completion.mode === "derived" ? { mode: "derived" as const, blockIds: spec.completion.blockIds.filter((x) => x !== b.id) } : spec.completion;
    const summarySource = spec.summarySource && spec.summarySource.kind !== "text" && spec.summarySource.blockId === b.id ? undefined : spec.summarySource;
    const front = spec.front.progressBlockIds ? { ...spec.front, progressBlockIds: spec.front.progressBlockIds.filter((x) => x !== b.id) } : spec.front;
    set({ blocks: spec.blocks.filter((x) => x.id !== b.id), completion, summarySource, front });
  };
  const tracking = trackingBlocks(spec);
  const derivedIds = spec.completion.mode === "derived" ? spec.completion.blockIds : [];
  const src = spec.summarySource ?? { kind: "text" as const };
  const srcValue = src.kind === "text" ? "text" : `${src.kind}:${src.blockId}`;
  const sourceOptions = [
    ...spec.blocks.filter((b) => b.type === "checklist").map((b) => ({ v: `next-item:${b.id}`, l: `Next item in “${b.title || "Checklist"}”` })),
    ...spec.blocks.filter((b) => b.type === "progress").map((b) => ({ v: `progress:${b.id}`, l: `Progress of “${b.title || "Progress"}”` })),
    ...spec.blocks.filter((b) => b.type === "note").map((b) => ({ v: `note:${b.id}`, l: `First line of “${b.title || "Notes"}”` })),
  ];
  const onSource = (v: string) => {
    if (v === "text") return set({ summarySource: undefined });
    const [kind, blockId] = v.split(":") as ["next-item" | "progress" | "note", string];
    set({ summarySource: { kind, blockId } });
  };
  const completionSummary = spec.completion.mode === "manual" ? "I mark it done" : "From checklists & targets";
  const coverSummary = spec.cover.kind === "none" ? "No cover" : spec.cover.kind === "color" ? "Colour" : spec.cover.kind === "url" ? "Image" : (COVER_PRESETS.find((p) => spec.cover.kind === "preset" && p.id === spec.cover.id)?.label ?? "Cover");

  return (
    <div className="space-y-6">
      <Group title="Basics">
        <Field label="Title" htmlFor={`${id}-title`}>
          <input id={`${id}-title`} className={inputCls} value={spec.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Dinner" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time (optional)" htmlFor={`${id}-t1`}>
            <div className="flex gap-1">
              <input id={`${id}-t1`} type="time" className={inputCls} value={spec.time ?? ""} onChange={(e) => set({ time: e.target.value || undefined, endTime: e.target.value ? spec.endTime : undefined })} />
              {spec.time && <IconButton label="Clear time" variant="ghost" onClick={() => set({ time: undefined, endTime: undefined })}><X size={16} /></IconButton>}
            </div>
          </Field>
          <Field label="Until (optional)" htmlFor={`${id}-t2`}>
            <input id={`${id}-t2`} type="time" disabled={!spec.time} className={inputCls} value={spec.endTime ?? ""} onChange={(e) => set({ endTime: e.target.value || undefined })} />
          </Field>
        </div>
        <Field label="Summary" htmlFor={`${id}-sum`}>
          <input id={`${id}-sum`} className={inputCls} value={spec.summary} disabled={src.kind !== "text"} onChange={(e) => set({ summary: e.target.value })} placeholder={src.kind === "text" ? "One line shown on the card, e.g. Salmon, rice & broccoli" : "Shown automatically"} />
        </Field>
        <Field label="Detail (optional)" htmlFor={`${id}-ctx`} hint="Shown before the summary: a project, route or book title.">
          <input id={`${id}-ctx`} className={inputCls} value={spec.context ?? ""} onChange={(e) => set({ context: e.target.value || undefined })} placeholder="e.g. Atlas redesign" autoComplete="off" />
        </Field>
        {sourceOptions.length > 0 && (
          <Field label="Summary shows" htmlFor={`${id}-src`}>
            <select id={`${id}-src`} className={inputCls} value={srcValue} onChange={(e) => onSource(e.target.value)}>
              <option value="text">The text I write</option>
              {sourceOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </Field>
        )}
      </Group>

      <CardPreview spec={spec} groupId={groupId} />

      <Group title="Content" help={<Help label="About content blocks">Build the back of the card from blocks and reorder them with the arrows. Notes can also be edited straight from the card.</Help>}>
        <div className="space-y-3">
          {spec.blocks.map((b, i) => (
            <div key={b.id} className="rounded-xl border border-line bg-bg/40 p-3">
              <div className="flex flex-wrap items-center gap-1">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent" aria-hidden>{BLOCK_META[b.type].icon}</span>
                <input aria-label={`${BLOCK_META[b.type].label} block title`} className={clsx(inputCls, "min-w-[7rem] flex-1")} value={b.title} onChange={(e) => setBlock({ ...b, title: e.target.value })} placeholder={BLOCK_META[b.type].label} />
                <span className="ml-auto flex">
                <IconButton label="Move block up" variant="ghost" disabled={i === 0} onClick={() => moveBlock(i, -1)}><ArrowUp size={16} /></IconButton>
                <IconButton label="Move block down" variant="ghost" disabled={i === spec.blocks.length - 1} onClick={() => moveBlock(i, 1)}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Remove ${b.title || BLOCK_META[b.type].label} block`} variant="ghost" onClick={() => removeBlock(b)} className="text-danger"><Trash2 size={16} /></IconButton>
                </span>
              </div>
              <div className="mt-3"><BlockBody block={b} onChange={setBlock} /></div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Add a block">
          {(Object.keys(BLOCK_META) as BlockType[]).map((t) => (
            <Button key={t} small onClick={() => set({ blocks: [...spec.blocks, addBlock(t)] })}><Plus size={14} aria-hidden /> {BLOCK_META[t].label}</Button>
          ))}
        </div>
      </Group>

      <Disclosure title="Appearance" summary={`${coverSummary} · ${spec.style === "cover" ? "cover card" : spec.density === "compact" ? "always compact" : "follows my view"}`}>
        <CoverPicker cover={spec.cover} focus={spec.focus} onChange={(p) => set(p)} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">Icon</p>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
            {[["", "Auto"], ...ICON_KEYS.filter((k) => k !== "coffee").map((k) => [k, ACTIVITY_ICONS[k].label])].map(([k, label]) => {
              const key = k || activityIconKey({ ...spec, icon: undefined });
              const { Icon } = ACTIVITY_ICONS[key];
              const on = (spec.icon ?? "") === k;
              return (
                <button key={k || "auto"} type="button" role="radio" aria-checked={on} aria-label={k ? label : `Automatic (${ACTIVITY_ICONS[key].label})`} title={k ? label : "Automatic: chosen from the title"} onClick={() => set({ icon: k || undefined })} className={clsx("grid size-11 place-items-center rounded-xl border-2", on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg")}>
                  <Icon size={20} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">Card colour</p>
          <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Card colour">
            <button type="button" role="radio" aria-checked={!spec.accent} onClick={() => set({ accent: "" })} className={clsx("min-h-11 rounded-xl border-2 px-3 text-sm", !spec.accent ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg")}>Match activity</button>
            {ACCENTS.map((c) => {
              const on = !!spec.accent && spec.accent.toLowerCase() === c;
              return (
                <button key={c} type="button" role="radio" aria-checked={on} aria-label={`Colour ${c}`} onClick={() => set({ accent: c })} className="grid size-11 place-items-center rounded-full">
                  <span className={clsx("grid size-8 place-items-center rounded-full border-2", on ? "border-fg" : "border-transparent")} style={{ background: c }}>{on && <Check size={14} strokeWidth={3} className="text-accent-ink" />}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">Card style</p>
          <Segmented
            label="Card style"
            value={spec.style === "cover" ? "cover" : spec.density === "compact" ? "compact" : "follow"}
            onChange={(v) => set(v === "cover" ? { style: "cover", density: "comfortable" } : { style: undefined, density: v === "compact" ? "compact" : "comfortable" })}
            options={[{ value: "follow", label: "Follow my view" }, { value: "compact", label: "Always compact" }, { value: "cover", label: "Cover card" }]}
          />
          {spec.style === "cover" && spec.cover.kind === "none" && <p className="mt-1.5 text-sm text-muted">Without a photo, a cover card shows a tinted banner with the activity icon.</p>}
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-muted">Show on the front</legend>
          {([["showTime", "Time"], ["showSummary", "Summary"], ["showProgress", "Progress"]] as const).map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={spec.front[k]} onChange={(e) => set({ front: { ...spec.front, [k]: e.target.checked } })} />
              {label}
            </label>
          ))}
          {spec.front.showProgress && tracking.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="mb-0.5 flex items-center gap-1 text-sm font-medium text-muted">Progress counts<Help label="About front progress">Chooses which lists and targets feed the progress line on the front of the card. It only changes what is shown — never when the card counts as done.</Help></p>
              {tracking.map((t) => {
                const shown = frontBlocks(spec).some((x) => x.id === t.id);
                return (
                  <label key={t.id} className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={shown} onChange={(e) => {
                      const cur = frontBlocks(spec).map((x) => x.id);
                      const next = e.target.checked ? [...cur, t.id] : cur.filter((x) => x !== t.id);
                      const dflt = relevantBlocks(spec).map((x) => x.id);
                      set({ front: { ...spec.front, progressBlockIds: next.length === dflt.length && next.every((x) => dflt.includes(x)) ? undefined : next } });
                    }} />
                    <span>{t.title || BLOCK_META[t.type].label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        {groupId && <PeopleSettings spec={spec} onChange={set} />}
      </Disclosure>

      <Disclosure title="Completion behavior" summary={completionSummary}>
        <div className="flex flex-wrap items-center">
          <Segmented
            label="Completion rule"
            value={spec.completion.mode}
            onChange={(m) => set({ completion: m === "manual" ? { mode: "manual" } : { mode: "derived", blockIds: derivedIds.length ? derivedIds : tracking.map((t) => t.id) } })}
            options={[{ value: "manual", label: "I mark it done" }, { value: "derived", label: "From checklists & targets" }]}
          />
          <Help label="About completion rules">“I mark it done”: only you complete the card; lists and targets just show progress. “From checklists &amp; targets”: it completes when every selected list is fully ticked and every target is reached. Notes alone never complete a card. Bars stop at 100%.</Help>
        </div>
        {spec.completion.mode === "derived" &&
          (tracking.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface-2 p-3 text-[15px]">Add a checklist or numeric target first — until then this card can’t complete.</p>
          ) : (
            <fieldset className="space-y-0.5">
              <legend className="mb-1 text-sm text-muted">Done when all of these are complete:</legend>
              {tracking.map((t) => (
                <label key={t.id} className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={derivedIds.includes(t.id)} onChange={(e) => set({ completion: { mode: "derived", blockIds: e.target.checked ? [...derivedIds, t.id] : derivedIds.filter((x) => x !== t.id) } })} />
                  <span>{t.title || BLOCK_META[t.type].label}</span>
                  <span className="text-sm text-muted">{t.type === "checklist" ? `${t.items.length} items` : `${t.target} ${t.unit}`}</span>
                </label>
              ))}
              {derivedIds.length === 0 && <p className="text-[15px] text-danger">Select at least one, or this card can never complete.</p>}
            </fieldset>
          ))}
      </Disclosure>
    </div>
  );
}

function BlockBody({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  if (block.type === "note") return <NoteEditor value={block.text} onChange={(text) => onChange({ ...block, text })} />;
  if (block.type === "checklist") return <ChecklistEditor block={block} onChange={onChange} />;
  if (block.type === "progress")
    return (
      <div className="grid grid-cols-3 gap-2">
        <Field label="Target">
          <input type="number" min={1} inputMode="decimal" className={inputCls} value={block.target} onChange={(e) => onChange({ ...block, target: Math.max(0, Number(e.target.value)) })} />
        </Field>
        <Field label="Unit">
          <input className={inputCls} value={block.unit} placeholder="min, pages…" onChange={(e) => onChange({ ...block, unit: e.target.value })} />
        </Field>
        <Field label="Quick +">
          <input type="number" min={0.5} step="any" inputMode="decimal" className={inputCls} value={block.step} onChange={(e) => onChange({ ...block, step: Math.max(0.1, Number(e.target.value)) })} />
        </Field>
      </div>
    );
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Name the jobs; assign people on the card once it’s shared.</p>
      {block.assignments.map((a, i) => (
        <div key={a.id} className="flex items-center gap-1">
          <input aria-label={`Responsibility ${i + 1}`} className={inputCls} value={a.label} placeholder="e.g. Cooking" onChange={(e) => onChange({ ...block, assignments: block.assignments.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)) })} />
          <IconButton label={`Remove responsibility ${i + 1}`} variant="ghost" className="text-danger" onClick={() => onChange({ ...block, assignments: block.assignments.filter((x) => x.id !== a.id) })}><X size={14} /></IconButton>
        </div>
      ))}
      <Button small onClick={() => onChange({ ...block, assignments: [...block.assignments, { id: uid(), label: "", userId: null }] })}><Plus size={14} aria-hidden /> Add responsibility</Button>
    </div>
  );
}

function NoteEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || "text";
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const bullet = () => {
    const el = ref.current;
    const s = el?.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    onChange(value.slice(0, lineStart) + "- " + value.slice(lineStart));
    requestAnimationFrame(() => el?.focus());
  };
  return (
    <div>
      <div className="mb-1 flex gap-1" role="toolbar" aria-label="Text formatting">
        <IconButton label="Bold" variant="ghost" onClick={() => wrap("**")}><Bold size={15} /></IconButton>
        <IconButton label="Italic" variant="ghost" onClick={() => wrap("*")}><Italic size={15} /></IconButton>
        <IconButton label="Bulleted list" variant="ghost" onClick={bullet}><List size={15} /></IconButton>
        <span className="ml-auto self-center text-xs text-muted">**bold** · *italic* · - list</span>
      </div>
      <textarea ref={ref} rows={4} aria-label="Note text" className={clsx(inputCls, "py-2")} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}


/** Shared cards: choose what the front says about people. Nothing is guessed — one responsibility, picked by you, or just the group. */
function PeopleSettings({ spec, onChange }: { spec: CardSpec; onChange: (p: Partial<CardSpec>) => void }) {
  const id = useId();
  const duties = spec.blocks.flatMap((b) => (b.type === "responsibility" ? b.assignments.map((a) => ({ id: a.id, label: a.label || "Unnamed", block: b.title })) : []));
  const on = spec.front.showPeople !== false;
  const setFront = (p: Partial<CardSpec["front"]>) => onChange({ front: { ...spec.front, ...p } });
  return (
    <fieldset className="space-y-1 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-medium text-muted">People on the front</legend>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={on} onChange={(e) => setFront({ showPeople: e.target.checked })} />
        Show the group{duties.length ? " and one responsibility" : ""}
      </label>
      {on && duties.length > 0 && (
        <Field label="Featured responsibility" htmlFor={`${id}-duty`} hint="Only the one you pick is shown, e.g. “Family · Maja cooking”.">
          <select id={`${id}-duty`} className={inputCls} value={spec.front.personAssignmentId ?? ""} onChange={(e) => setFront({ personAssignmentId: e.target.value || undefined })}>
            <option value="">Group name only</option>
            {duties.map((d) => <option key={d.id} value={d.id}>{d.label}{duties.length > 1 && d.block ? ` (${d.block})` : ""}</option>)}
          </select>
        </Field>
      )}
      {on && duties.length === 0 && <p className="text-sm text-muted">Add a Responsibilities block to feature who is doing what.</p>}
      <p className="text-sm text-muted">Everyone in the group sees the same line; it is part of the card, not a personal setting.</p>
    </fieldset>
  );
}

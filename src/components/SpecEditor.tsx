"use client";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Bold, CheckSquare, Italic, List, ListChecks, Plus, StickyNote, Target, Trash2, Users, X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { ACCENTS, addBlock, uid } from "@/lib/domain/factory";
import { trackingBlocks } from "@/lib/domain/progress";
import type { Block, BlockType, CardSpec, Cover } from "@/lib/domain/types";
import { COVER_COLORS, COVER_PRESETS, presetUri } from "@/lib/ui/covers";
import { Button, Field, IconButton, Segmented, inputCls } from "./ui";

const BLOCK_META: Record<BlockType, { label: string; icon: ReactNode }> = {
  note: { label: "Notes", icon: <StickyNote size={16} /> },
  checklist: { label: "Checklist", icon: <ListChecks size={16} /> },
  progress: { label: "Numeric target", icon: <Target size={16} /> },
  responsibility: { label: "Responsibilities", icon: <Users size={16} /> },
};

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-serif text-xl">{title}</h3>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function SpecEditor({ spec, onChange }: { spec: CardSpec; onChange: (s: CardSpec) => void }) {
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
    set({ blocks: spec.blocks.filter((x) => x.id !== b.id), completion });
  };
  const tracking = trackingBlocks(spec);
  const derivedIds = spec.completion.mode === "derived" ? spec.completion.blockIds : [];

  return (
    <div className="space-y-8">
      <Group title="Basics">
        <Field label="Title" htmlFor={`${id}-title`}>
          <input id={`${id}-title`} className={inputCls} value={spec.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Dinner" />
        </Field>
        <Field label="Summary" htmlFor={`${id}-sum`} hint="A short line shown on the front of the card.">
          <input id={`${id}-sum`} className={inputCls} value={spec.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="e.g. Salmon, rice & broccoli" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (optional)" htmlFor={`${id}-t1`}>
            <div className="flex gap-1">
              <input id={`${id}-t1`} type="time" className={inputCls} value={spec.time ?? ""} onChange={(e) => set({ time: e.target.value || undefined, endTime: e.target.value ? spec.endTime : undefined })} />
              {spec.time && <IconButton label="Clear time" variant="ghost" onClick={() => set({ time: undefined, endTime: undefined })}><X size={16} /></IconButton>}
            </div>
          </Field>
          <Field label="Ends (optional)" htmlFor={`${id}-t2`}>
            <input id={`${id}-t2`} type="time" disabled={!spec.time} className={inputCls} value={spec.endTime ?? ""} onChange={(e) => set({ endTime: e.target.value || undefined })} />
          </Field>
        </div>
        <p className="text-xs text-muted">Cards without a time work fine — they simply sit in the order you give them.</p>
      </Group>

      <Group title="Content" hint="Build the back of the card from blocks. Reorder with the arrows.">
        <div className="space-y-3">
          {spec.blocks.map((b, i) => (
            <div key={b.id} className="rounded-2xl border border-line bg-bg/60 p-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-amber" aria-hidden>{BLOCK_META[b.type].icon}</span>
                <input aria-label={`${BLOCK_META[b.type].label} block title`} className={clsx(inputCls, "min-h-10 flex-1")} value={b.title} onChange={(e) => setBlock({ ...b, title: e.target.value })} placeholder={BLOCK_META[b.type].label} />
                <IconButton label="Move block up" variant="ghost" disabled={i === 0} onClick={() => moveBlock(i, -1)} className="size-10"><ArrowUp size={16} /></IconButton>
                <IconButton label="Move block down" variant="ghost" disabled={i === spec.blocks.length - 1} onClick={() => moveBlock(i, 1)} className="size-10"><ArrowDown size={16} /></IconButton>
                <IconButton label={`Remove ${b.title || BLOCK_META[b.type].label} block`} variant="ghost" onClick={() => removeBlock(b)} className="size-10 text-danger"><Trash2 size={16} /></IconButton>
              </div>
              <div className="mt-3"><BlockBody block={b} onChange={setBlock} /></div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Add a block">
          {(Object.keys(BLOCK_META) as BlockType[]).map((t) => (
            <Button key={t} small onClick={() => set({ blocks: [...spec.blocks, addBlock(t)] })}>
              <Plus size={14} aria-hidden /> {BLOCK_META[t].label}
            </Button>
          ))}
        </div>
      </Group>

      <Group title="Completion" hint="How does this card become “done”?">
        <Segmented
          label="Completion rule"
          value={spec.completion.mode}
          onChange={(m) => set({ completion: m === "manual" ? { mode: "manual" } : { mode: "derived", blockIds: derivedIds.length ? derivedIds : tracking.map((t) => t.id) } })}
          options={[{ value: "manual", label: "I mark it done" }, { value: "derived", label: "From checklists & targets" }]}
        />
        {spec.completion.mode === "manual" ? (
          <p className="text-sm text-muted">Done only when you tick it. Checklists and targets still show progress, but never complete the card on their own.</p>
        ) : tracking.length === 0 ? (
          <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm">Add a checklist or numeric target to use this rule. Until then the card can’t complete — notes alone never count.</p>
        ) : (
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm text-muted">Done when all of these are complete:</legend>
            {tracking.map((t) => (
              <label key={t.id} className="flex min-h-10 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-amber)]"
                  checked={derivedIds.includes(t.id)}
                  onChange={(e) => set({ completion: { mode: "derived", blockIds: e.target.checked ? [...derivedIds, t.id] : derivedIds.filter((x) => x !== t.id) } })}
                />
                <span>{t.title || BLOCK_META[t.type].label}</span>
                <span className="text-sm text-muted">{t.type === "checklist" ? `${t.items.length} items` : `${t.target} ${t.unit}`}</span>
              </label>
            ))}
            {derivedIds.length === 0 && <p className="text-sm text-danger">Select at least one, otherwise this card can never complete.</p>}
            <p className="pt-1 text-xs text-muted">Numeric targets stop counting at 100%. Empty checklists don’t count as complete.</p>
          </fieldset>
        )}
      </Group>

      <Group title="Look & front of card">
        <CoverPicker cover={spec.cover} onChange={(cover) => set({ cover })} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">Accent colour</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={spec.accent === c} aria-label={`Accent ${c}`} onClick={() => set({ accent: c })} className={clsx("size-9 rounded-full border-2", spec.accent === c ? "border-ivory" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">Display</p>
          <Segmented label="Display density" value={spec.density} onChange={(density) => set({ density })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-muted">Show on the front</legend>
          {(
            [
              ["showTime", "Time"],
              ["showSummary", "Summary"],
              ["showProgress", "Progress"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex min-h-10 items-center gap-3">
              <input type="checkbox" className="size-5 accent-[var(--color-amber)]" checked={spec.front[k]} onChange={(e) => set({ front: { ...spec.front, [k]: e.target.checked } })} />
              {label}
            </label>
          ))}
        </fieldset>
      </Group>
    </div>
  );
}

function CoverPicker({ cover, onChange }: { cover: Cover; onChange: (c: Cover) => void }) {
  const id = useId();
  const tile = (active: boolean) => clsx("relative h-14 overflow-hidden rounded-xl border-2 text-xs", active ? "border-amber" : "border-line");
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted">Cover</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Cover">
        <button type="button" role="radio" aria-checked={cover.kind === "none"} className={clsx(tile(cover.kind === "none"), "bg-bg")} onClick={() => onChange({ kind: "none" })}>None</button>
        {COVER_PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={cover.kind === "preset" && cover.id === p.id} aria-label={p.label} title={p.label} className={tile(cover.kind === "preset" && cover.id === p.id)} onClick={() => onChange({ kind: "preset", id: p.id })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={presetUri(p.id)!} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Plain colour covers">
        <span className="text-sm text-muted">Plain colour</span>
        {COVER_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cover.kind === "color" && cover.color === c} aria-label={`Colour ${c}`} onClick={() => onChange({ kind: "color", color: c })} className={clsx("size-8 rounded-full border-2", cover.kind === "color" && cover.color === c ? "border-ivory" : "border-line")} style={{ background: c }} />
        ))}
      </div>
      <Field label="Or an image URL" htmlFor={`${id}-url`} hint="If the image can’t load, the card falls back to its accent tint.">
        <input id={`${id}-url`} className={inputCls} inputMode="url" placeholder="https://…" value={cover.kind === "url" ? cover.url : ""} onChange={(e) => onChange(e.target.value.trim() ? { kind: "url", url: e.target.value.trim() } : { kind: "none" })} />
      </Field>
    </div>
  );
}

function BlockBody({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  if (block.type === "note") return <NoteEditor value={block.text} onChange={(text) => onChange({ ...block, text })} />;
  if (block.type === "checklist") {
    const setItems = (items: typeof block.items) => onChange({ ...block, items });
    return (
      <div className="space-y-2">
        {block.items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-1">
            <input
              aria-label={`Item ${i + 1}`}
              className={clsx(inputCls, "min-h-10")}
              value={it.text}
              onChange={(e) => setItems(block.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const n = { id: uid(), text: "" };
                  const items = [...block.items];
                  items.splice(i + 1, 0, n);
                  setItems(items);
                  requestAnimationFrame(() => (document.querySelector(`[data-item="${n.id}"]`) as HTMLInputElement | null)?.focus());
                }
              }}
              data-item={it.id}
            />
            <IconButton label={`Move item ${i + 1} up`} variant="ghost" className="size-10" disabled={i === 0} onClick={() => { const a = [...block.items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setItems(a); }}><ArrowUp size={14} /></IconButton>
            <IconButton label={`Move item ${i + 1} down`} variant="ghost" className="size-10" disabled={i === block.items.length - 1} onClick={() => { const a = [...block.items]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setItems(a); }}><ArrowDown size={14} /></IconButton>
            <IconButton label={`Remove item ${i + 1}`} variant="ghost" className="size-10 text-danger" onClick={() => setItems(block.items.filter((x) => x.id !== it.id))}><X size={14} /></IconButton>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button small onClick={() => setItems([...block.items, { id: uid(), text: "" }])}><Plus size={14} aria-hidden /> Add item</Button>
          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            Called
            <input aria-label="What items are called (plural)" className={clsx(inputCls, "min-h-9 w-28 text-sm")} value={block.noun ?? ""} placeholder="items" onChange={(e) => onChange({ ...block, noun: e.target.value || undefined })} />
          </label>
        </div>
      </div>
    );
  }
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
      <p className="text-xs text-muted">Name the jobs here; pick who does each one on the card once it’s shared with a group.</p>
      {block.assignments.map((a, i) => (
        <div key={a.id} className="flex items-center gap-1">
          <input aria-label={`Responsibility ${i + 1}`} className={clsx(inputCls, "min-h-10")} value={a.label} placeholder="e.g. Cooking" onChange={(e) => onChange({ ...block, assignments: block.assignments.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)) })} />
          <IconButton label={`Remove responsibility ${i + 1}`} variant="ghost" className="size-10 text-danger" onClick={() => onChange({ ...block, assignments: block.assignments.filter((x) => x.id !== a.id) })}><X size={14} /></IconButton>
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
        <IconButton label="Bold" variant="ghost" className="size-9" onClick={() => wrap("**")}><Bold size={15} /></IconButton>
        <IconButton label="Italic" variant="ghost" className="size-9" onClick={() => wrap("*")}><Italic size={15} /></IconButton>
        <IconButton label="Bulleted list" variant="ghost" className="size-9" onClick={bullet}><List size={15} /></IconButton>
        <span className="ml-auto self-center text-xs text-muted">**bold** · *italic* · - list</span>
      </div>
      <textarea ref={ref} rows={4} aria-label="Note text" className={clsx(inputCls, "py-2")} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

void CheckSquare;

"use client";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useState } from "react";
import type { DayCard, DayView } from "@/lib/domain/dayview";
import { formatTimeRange } from "@/lib/domain/dates";
import type { ID, Section } from "@/lib/domain/types";
import { IconButton } from "./ui";

type Layout = { sectionId: ID | null; ids: ID[] }[];
const key = (s: ID | null) => `sec:${s ?? "none"}`;

/**
 * Arrange mode. Drag by the handle (pointer, touch or keyboard: Space to lift, arrows to move, Space to drop),
 * or use the always-available Up/Down buttons and the section menu — no drag required.
 */
export function ArrangeView({ view, sections, onChange }: { view: DayView; sections: Section[]; onChange: (l: Layout) => void }) {
  const fromView = (): Layout => view.sections.map((g) => ({ sectionId: g.section?.id ?? null, ids: g.cards.map((c) => c.instance.id) }));
  const [layout, setLayout] = useState<Layout>(fromView);
  const [live, setLive] = useState("");
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setLayout(fromView());
  }
  const cards = new Map<ID, DayCard>(view.sections.flatMap((g) => g.cards).map((c) => [c.instance.id, c]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const nameOf = (sid: ID | null) => (sid ? (sections.find((s) => s.id === sid)?.name ?? "section") : "Anytime");

  const containerOf = (id: string, l: Layout) => (id.startsWith("sec:") ? l.find((g) => key(g.sectionId) === id) : l.find((g) => g.ids.includes(id)));

  const onOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    setLayout((l) => {
      const from = containerOf(String(active.id), l);
      const to = containerOf(String(over.id), l);
      if (!from || !to || from === to) return l;
      const overIdx = to.ids.indexOf(String(over.id));
      return l.map((g) => {
        if (g === from) return { ...g, ids: g.ids.filter((x) => x !== active.id) };
        if (g === to) {
          const ids = [...g.ids];
          ids.splice(overIdx >= 0 ? overIdx : ids.length, 0, String(active.id));
          return { ...g, ids };
        }
        return g;
      });
    });
  };
  const onEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    let next = layout;
    if (over) {
      const c = containerOf(String(active.id), layout);
      if (c) {
        const a = c.ids.indexOf(String(active.id));
        const b = c.ids.indexOf(String(over.id));
        if (b >= 0 && a !== b) next = layout.map((g) => (g === c ? { ...g, ids: arrayMove(g.ids, a, b) } : g));
      }
    }
    setLayout(next);
    const c = containerOf(String(active.id), next);
    setLive(`${cards.get(String(active.id))?.instance.spec.title} moved to ${nameOf(c?.sectionId ?? null)}, position ${(c?.ids.indexOf(String(active.id)) ?? 0) + 1}`);
    onChange(next);
  };
  const nudge = (id: ID, d: -1 | 1) => {
    const g = layout.find((x) => x.ids.includes(id))!;
    const i = g.ids.indexOf(id);
    if (i + d < 0 || i + d >= g.ids.length) return;
    const next = layout.map((x) => (x === g ? { ...x, ids: arrayMove(x.ids, i, i + d) } : x));
    setLayout(next);
    setLive(`${cards.get(id)?.instance.spec.title} moved ${d < 0 ? "up" : "down"} to position ${i + d + 1} of ${g.ids.length}`);
    onChange(next);
  };
  const toSection = (id: ID, sid: ID | null) => {
    const next = layout.map((g) => ({ ...g, ids: g.sectionId === sid ? [...g.ids.filter((x) => x !== id), id] : g.ids.filter((x) => x !== id) }));
    setLayout(next);
    setLive(`${cards.get(id)?.instance.spec.title} moved to ${nameOf(sid)}`);
    onChange(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onOver} onDragEnd={onEnd}>
      <p className="sr-only" role="status" aria-live="assertive">{live}</p>
      <div className="space-y-6">
        {layout.map((g) => {
          if (g.sectionId === null && g.ids.length === 0) return null;
          return (
            <Zone key={key(g.sectionId)} id={key(g.sectionId)} title={nameOf(g.sectionId)}>
              <SortableContext items={g.ids} strategy={verticalListSortingStrategy}>
                <ul className="grid gap-2 md:grid-cols-2">
                  {g.ids.map((id, i) => (
                    <Row key={id} card={cards.get(id)!} index={i} count={g.ids.length} sections={sections} current={g.sectionId} onNudge={nudge} onSection={toSection} />
                  ))}
                </ul>
              </SortableContext>
              {g.ids.length === 0 && <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">Drop a card here, or use a card’s section menu.</p>}
            </Zone>
          );
        })}
      </div>
    </DndContext>
  );
}

function Zone({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={title} className={clsx("rounded-3xl p-1 transition-colors", isOver && "bg-amber/5")}>
      <h2 className="mb-2 px-1 font-serif text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Row({ card, index, count, sections, current, onNudge, onSection }: { card: DayCard; index: number; count: number; sections: Section[]; current: ID | null; onNudge: (id: ID, d: -1 | 1) => void; onSection: (id: ID, s: ID | null) => void }) {
  const id = card.instance.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const spec = card.instance.spec;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx("flex items-center gap-1 rounded-2xl border border-line bg-surface p-2", isDragging && "z-10 opacity-80 shadow-xl ring-1 ring-amber")}>
      <button type="button" {...attributes} {...listeners} aria-label={`Drag ${spec.title}. Press space to pick up, arrow keys to move.`} className="grid size-11 shrink-0 touch-none place-items-center rounded-xl text-muted hover:bg-surface-2 active:cursor-grabbing">
        <GripVertical size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-lg leading-tight">{spec.title}</p>
        <p className="truncate text-sm text-muted">{formatTimeRange(spec.time, spec.endTime) || "No time"}</p>
      </div>
      <select aria-label={`Section for ${spec.title}`} value={current ?? ""} onChange={(e) => onSection(id, e.target.value || null)} className="min-h-10 max-w-28 rounded-lg border border-line bg-bg px-1 text-sm">
        <option value="">Anytime</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <IconButton label={`Move ${spec.title} up`} variant="ghost" className="size-10" disabled={index === 0} onClick={() => onNudge(id, -1)}><ArrowUp size={16} /></IconButton>
      <IconButton label={`Move ${spec.title} down`} variant="ghost" className="size-10" disabled={index === count - 1} onClick={() => onNudge(id, 1)}><ArrowDown size={16} /></IconButton>
    </li>
  );
}

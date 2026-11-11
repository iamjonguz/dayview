"use client";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Menu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, GripVertical, MoreHorizontal, Plus, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uid } from "@/lib/domain/factory";
import type { ChecklistBlock, ChecklistItem } from "@/lib/domain/types";
import { Button, IconButton, inputCls } from "./ui";

/**
 * Checklist content editor. Typing and adding are always prominent; structural changes live behind an explicit
 * "Reorder" mode (drag handle, or the Up/Down buttons for keyboard and switch users) and a small per-item menu.
 * Item ids never change, so recorded completion survives reordering, and a removed item can be brought back.
 */
export function ChecklistEditor({ block, onChange }: { block: ChecklistBlock; onChange: (b: ChecklistBlock) => void }) {
  const [reorder, setReorder] = useState(false);
  const [removed, setRemoved] = useState<{ item: ChecklistItem; index: number } | null>(null);
  const focusAfter = useRef<string | null>(null);
  // always act on the latest block, even from an Undo pressed several edits later
  const latest = useRef({ block, onChange });
  useEffect(() => {
    latest.current = { block, onChange };
  });
  const items = block.items;
  const setItems = (next: ChecklistItem[]) => onChange({ ...block, items: next });
  const focusItem = (id: string) => requestAnimationFrame(() => (document.querySelector(`[data-item="${id}"]`) as HTMLInputElement | null)?.focus());

  const insertAfter = (i: number, text = "") => {
    const n = { id: uid(), text };
    const next = [...items];
    next.splice(i + 1, 0, n);
    setItems(next);
    focusAfter.current = n.id;
    focusItem(n.id);
  };
  const remove = (i: number) => {
    setRemoved({ item: items[i], index: i });
    setItems(items.filter((_, k) => k !== i));
  };
  const undo = () => {
    if (!removed) return;
    const { block: b, onChange: on } = latest.current;
    if (!b.items.some((x) => x.id === removed.item.id)) {
      const next = [...b.items];
      next.splice(Math.min(removed.index, next.length), 0, removed.item);
      on({ ...b, items: next });
      focusItem(removed.item.id);
    }
    setRemoved(null);
  };
  const move = (i: number, d: -1 | 1) => {
    if (i + d < 0 || i + d >= items.length) return;
    setItems(arrayMove(items, i, i + d));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((x) => x.id === e.active.id);
    const to = items.findIndex((x) => x.id === e.over!.id);
    if (from >= 0 && to >= 0) setItems(arrayMove(items, from, to));
  };

  const label = (it: ChecklistItem, i: number) => it.text.trim() || `item ${i + 1}`;

  return (
    <div className="space-y-2">
      {items.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted" aria-live="polite">{reorder ? "Drag the handle, or use the arrows." : `${items.length} items`}</p>
          <Button small variant={reorder ? "primary" : "outline"} aria-pressed={reorder} onClick={() => setReorder(!reorder)}>
            <ArrowUpDown size={14} aria-hidden /> {reorder ? "Done reordering" : "Reorder"}
          </Button>
        </div>
      )}

      {reorder ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <SortableRow key={it.id} id={it.id}>
                  {(handle) => (
                    <>
                      {handle}
                      <span className="min-w-0 flex-1 truncate text-[15px]">{it.text || <span className="text-muted">Empty item</span>}</span>
                      <IconButton label={`Move “${label(it, i)}” up`} variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></IconButton>
                      <IconButton label={`Move “${label(it, i)}” down`} variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></IconButton>
                    </>
                  )}
                </SortableRow>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-1">
              <input
                aria-label={`Item ${i + 1}`}
                className={clsx(inputCls, "min-w-0 flex-1")}
                value={it.text}
                data-item={it.id}
                onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insertAfter(i);
                  }
                }}
              />
              <Menu.Root>
                <Menu.Trigger asChild>
                  <IconButton label={`More actions for ${label(it, i)}`} variant="ghost" className="text-muted"><MoreHorizontal size={18} /></IconButton>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content
                    align="end"
                    sideOffset={4}
                    onCloseAutoFocus={(e) => {
                      if (focusAfter.current) {
                        e.preventDefault();
                        focusAfter.current = null;
                      }
                    }}
                    className="z-[90] min-w-48 rounded-2xl border border-line bg-surface-2 p-1.5 text-[15px] shadow-lg"
                  >
                    <Menu.Item onSelect={() => insertAfter(i)} className={menuItem}><Plus size={16} aria-hidden /> Add item below</Menu.Item>
                    <Menu.Item onSelect={() => insertAfter(i, it.text)} className={menuItem}><Copy size={16} aria-hidden /> Duplicate</Menu.Item>
                    <Menu.Separator className="my-1 h-px bg-line" />
                    <Menu.Item onSelect={() => remove(i)} className={clsx(menuItem, "text-danger")}><Trash2 size={16} aria-hidden /> Remove</Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            </li>
          ))}
        </ul>
      )}

      {removed && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-surface-2 py-1 pl-3 pr-1 text-[15px]">
          <span className="min-w-0 flex-1 truncate">Removed “{removed.item.text || "empty item"}”</span>
          <button type="button" onClick={undo} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-semibold text-accent hover:bg-white/10"><Undo2 size={15} aria-hidden /> Undo</button>
          <IconButton label="Dismiss" variant="ghost" onClick={() => setRemoved(null)}><X size={16} /></IconButton>
        </p>
      )}

      {!reorder && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button small variant="soft" onClick={() => insertAfter(items.length - 1)}><Plus size={14} aria-hidden /> Add item</Button>
          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            Called
            <input aria-label="What items are called (plural)" className={clsx(inputCls, "w-28 text-sm")} value={block.noun ?? ""} placeholder="items" onChange={(e) => onChange({ ...block, noun: e.target.value || undefined })} />
          </label>
        </div>
      )}
    </div>
  );
}

const menuItem = "flex min-h-11 cursor-default items-center gap-2 rounded-xl px-3 outline-none data-[highlighted]:bg-white/10";

function SortableRow({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button ref={setActivatorNodeRef} type="button" aria-label="Drag to reorder (or press Space, then the arrow keys)" {...attributes} {...listeners} className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-muted hover:bg-white/10 active:cursor-grabbing">
      <GripVertical size={18} aria-hidden />
    </button>
  );
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx("flex items-center gap-1 rounded-xl border border-line bg-bg/60 pr-1", isDragging && "relative z-10 border-accent shadow-lg")}>
      {children(handle)}
    </li>
  );
}

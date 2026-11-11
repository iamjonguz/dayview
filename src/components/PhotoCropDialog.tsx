"use client";
import clsx from "clsx";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { Focus } from "@/lib/domain/types";
import { clamp01, FOCUS_DEFAULT, focusStyle } from "@/lib/ui/images";
import { Button, Sheet } from "./ui";

const STEP = 0.04;

/**
 * Frame a photo once; the same focal point and zoom are used for the compact thumbnail, the cover card and the larger
 * comfortable card. Drag (or use the arrow keys) to move what stays in view; zoom with the slider or + / −.
 */
export function PhotoCropDialog({
  src,
  initial,
  title,
  busy,
  progress,
  error,
  confirmLabel = "Use photo",
  onCancel,
  onConfirm,
}: {
  src: string;
  initial?: Focus;
  title: string;
  busy?: boolean;
  /** 0–100 while saving; shown as a labelled progress bar */
  progress?: { label: string; pct: number } | null;
  error?: string | null;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (f: Focus) => void;
}) {
  const id = useId();
  const [f, setF] = useState<Focus>(initial ?? FOCUS_DEFAULT);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; w: number; h: number } | null>(null);
  const set = (p: Partial<Focus>) => setF((cur) => ({ ...cur, ...p, x: clamp01(p.x ?? cur.x), y: clamp01(p.y ?? cur.y), zoom: Math.min(3, Math.max(1, p.zoom ?? cur.zoom)) }));

  const frameCls = "relative overflow-hidden rounded-xl bg-bg";
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" draggable={false} style={focusStyle(f)} className="absolute inset-0 size-full select-none object-cover" />
  );

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && !busy && onCancel()}
      title={title}
      description="Drag the photo to choose what stays in view."
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => onConfirm(f)} disabled={busy}>{busy ? "Saving…" : confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          role="group"
          tabIndex={0}
          aria-label="Photo frame. Use the arrow keys to move the photo, plus and minus to zoom."
          className={clsx(frameCls, "aspect-[4/3] w-full cursor-grab touch-none active:cursor-grabbing")}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            drag.current = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y, w: r.width, h: r.height };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            // dragging the photo right reveals more of its left side, so the focal point moves the other way
            set({ x: d.fx - (e.clientX - d.x) / (d.w * 0.9), y: d.fy - (e.clientY - d.y) / (d.h * 0.9) });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            const k = e.key;
            if (k === "ArrowLeft") set({ x: f.x - STEP });
            else if (k === "ArrowRight") set({ x: f.x + STEP });
            else if (k === "ArrowUp") set({ y: f.y - STEP });
            else if (k === "ArrowDown") set({ y: f.y + STEP });
            else if (k === "+" || k === "=") set({ zoom: f.zoom + 0.1 });
            else if (k === "-") set({ zoom: f.zoom - 0.1 });
            else return;
            e.preventDefault();
          }}
        >
          {img}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/15" />
        </div>

        <div className="flex items-center gap-2">
          <button type="button" aria-label="Zoom out" onClick={() => set({ zoom: f.zoom - 0.2 })} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line hover:bg-surface-2"><Minus size={18} aria-hidden /></button>
          <label htmlFor={`${id}-z`} className="sr-only">Zoom</label>
          <input id={`${id}-z`} type="range" min={1} max={3} step={0.05} value={f.zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} className="h-11 min-w-0 flex-1 accent-[var(--color-accent)]" />
          <button type="button" aria-label="Zoom in" onClick={() => set({ zoom: f.zoom + 0.2 })} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line hover:bg-surface-2"><Plus size={18} aria-hidden /></button>
          <button type="button" aria-label="Reset framing" onClick={() => setF(FOCUS_DEFAULT)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line hover:bg-surface-2"><RotateCcw size={16} aria-hidden /></button>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">How it will look</p>
          <div className="flex items-end gap-3">
            <div className="text-center">
              <div className={clsx(frameCls, "size-14")}>{img}</div>
              <p className="mt-1 text-[13px] text-muted">Compact</p>
            </div>
            <div className="min-w-0 flex-1 text-center">
              <div className={clsx(frameCls, "h-14 w-full")}>{img}</div>
              <p className="mt-1 text-[13px] text-muted">Cover card</p>
            </div>
          </div>
        </div>

        {progress && (
          <div>
            <p className="mb-1 text-sm text-muted" aria-live="polite">{progress.label}…</p>
            <progress className="h-2 w-full accent-[var(--color-accent)]" max={100} value={progress.pct} aria-label={progress.label} />
          </div>
        )}
        {error && <p role="alert" className="rounded-xl border border-danger/60 bg-surface-2 p-3 text-[15px] text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

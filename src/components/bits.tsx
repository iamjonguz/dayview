"use client";
import clsx from "clsx";
import { Fragment, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { activityStyle } from "@/lib/ui/activity";
import { presetGradient, presetUri } from "@/lib/ui/covers";
import { focusStyle } from "@/lib/ui/images";
import { useImageUrl } from "@/lib/ui/useImage";
import type { CardSpec, Cover, Focus } from "@/lib/domain/types";

/** Fill is the activity colour while in progress and mint once complete (never beyond 100%). */
export function ProgressBar({ fraction, label, accent = "var(--color-accent)", className }: { fraction: number; label?: string; accent?: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={clsx("h-1.5 overflow-hidden rounded-full bg-line", className)}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--color-done)" : accent }} />
    </div>
  );
}

/** What to show for a cover: resolves uploads through access-checked storage, and falls back (preset photo → its gradient). */
function useCoverSrc(cover: Cover) {
  const [failed, setFailed] = useState<string | null>(null);
  const up = useImageUrl(cover.kind === "upload" ? cover.path : null);
  const wanted = cover.kind === "url" ? cover.url : cover.kind === "preset" ? presetUri(cover.id) : cover.kind === "upload" ? up.url : null;
  const src = wanted && failed === wanted ? (cover.kind === "preset" ? presetGradient(cover.id) : null) : wanted;
  return { src, loading: cover.kind === "upload" && up.status === "loading", onError: () => wanted && setFailed(wanted) };
}

/** Cover background (fills its parent). Missing/failed images become a plain surface. */
export function CoverBackground({ cover, accent, focus }: { cover: Cover; accent: string; focus?: Focus }) {
  const { src, onError } = useCoverSrc(cover);
  void accent;
  if (cover.kind === "color") return <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${cover.color}, color-mix(in srgb, ${cover.color} 60%, var(--color-bg)))` }} />;
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" aria-hidden loading="lazy" onError={onError} style={focusStyle(focus)} className="absolute inset-0 size-full object-cover" />
    );
  return <div aria-hidden className="absolute inset-0 bg-surface" />;
}

/**
 * The card's leading visual: its photo when it has one, otherwise an icon tile in the activity colour. Either way it sits
 * in a softly tinted surround of the card's colour, so personal colour shows up without touching text or progress.
 */
export function ActivityVisual({ spec, size = 52, dim, className }: { spec: Pick<CardSpec, "title" | "icon" | "accent" | "cover" | "focus">; size?: number; dim?: boolean; className?: string }) {
  const { Icon, color } = activityStyle(spec);
  const c = spec.cover;
  const { src, onError } = useCoverSrc(c);
  const pad = 3;
  const inner = size - pad * 2;
  const wrap = clsx("relative grid shrink-0 place-items-center overflow-hidden rounded-[14px]", dim && "opacity-60", className);
  const wrapStyle = { width: size, height: size, background: `color-mix(in srgb, ${color} 30%, var(--color-surface))` };
  const box = { width: inner, height: inner };
  return (
    <span aria-hidden className={wrap} style={wrapStyle}>
      {c.kind === "color" ? (
        <span className="relative grid place-items-center overflow-hidden rounded-[11px]" style={{ ...box, background: `linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 60%, var(--color-bg)))` }}>
          <Icon size={inner * 0.45} className="text-fg/90" />
        </span>
      ) : src ? (
        <span className="relative block overflow-hidden rounded-[11px]" style={box}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" onError={onError} style={focusStyle(spec.focus)} className="size-full object-cover" />
        </span>
      ) : (
        <Icon size={inner * 0.5} strokeWidth={2} style={{ color }} />
      )}
    </span>
  );
}

/**
 * Full-height leading panel of a compact card: the photo bleeds to the card's edge (framed by the saved focal point).
 * Without a usable photo it becomes a tinted panel with the activity icon, so every card lines up the same way.
 * A thin strip of the card's colour on its inner edge carries the personal colour.
 */
export function ActivityPanel({ spec, dim, className }: { spec: Pick<CardSpec, "title" | "icon" | "accent" | "cover" | "focus">; dim?: boolean; className?: string }) {
  const { Icon, color } = activityStyle(spec);
  const { src, onError } = useCoverSrc(spec.cover);
  const plain = spec.cover.kind === "color" ? spec.cover.color : null;
  return (
    <div aria-hidden className={clsx("relative shrink-0 self-stretch overflow-hidden", className)} style={{ background: `color-mix(in srgb, ${color} 22%, var(--color-surface))` }}>
      <div className={clsx("absolute inset-0", dim && "opacity-60")}>
        {plain ? (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${plain}, color-mix(in srgb, ${plain} 60%, var(--color-bg)))` }} />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" onError={onError} style={focusStyle(spec.focus)} className="absolute inset-0 size-full object-cover" />
        ) : null}
        {!src && <Icon size={30} strokeWidth={1.9} style={{ color }} className="absolute inset-0 m-auto" />}
      </div>
      <span className="absolute inset-y-0 right-0 w-[3px]" style={{ background: color }} />
    </div>
  );
}

/** Neutral fill for in-progress bars/rings: personal colours never stand in for "done" (that is always mint). */
export const PROGRESS_FILL = "color-mix(in srgb, var(--color-fg) 62%, transparent)";

/** The photographic strip of a cover card. Without a usable image it becomes a tinted surface with the activity icon. */
export function CoverBanner({ spec, dim, className }: { spec: Pick<CardSpec, "title" | "icon" | "accent" | "cover" | "focus">; dim?: boolean; className?: string }) {
  const { Icon, color } = activityStyle(spec);
  const { src, onError } = useCoverSrc(spec.cover);
  const plain = spec.cover.kind === "color";
  return (
    <div aria-hidden className={clsx("relative overflow-hidden", dim && "opacity-60", className)} style={{ background: `color-mix(in srgb, ${color} 20%, var(--color-surface))` }}>
      {plain ? (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${(spec.cover as { color: string }).color}, color-mix(in srgb, ${(spec.cover as { color: string }).color} 60%, var(--color-bg)))` }} />
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={onError} style={focusStyle(spec.focus)} className="absolute inset-0 size-full object-cover" />
      ) : null}
      {!src && <Icon size={38} strokeWidth={1.75} style={{ color }} className="absolute left-5 top-1/2 -translate-y-1/2 opacity-90" />}
    </div>
  );
}

/** Contextual help: a labelled button that reveals a short note. Keeps explanations out of the way until asked for. */
export function HelpNote({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={className}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} className="inline-grid size-11 place-items-center rounded-full text-muted hover:text-fg">
        <CircleHelp size={18} aria-hidden />
      </button>
      {open && <span role="note" className="mb-1 block rounded-lg bg-surface-2 px-3 py-2 text-[15px] font-normal leading-snug text-muted">{children}</span>}
    </span>
  );
}
export const hasImage = (c: Cover) => c.kind !== "none";

/** Tiny safe renderer for the notes mini-format: **bold**, *italic*, and "- " bullet lines. No raw HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  text.split(re).forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) out.push(<strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>);
    else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) out.push(<em key={i}>{part.slice(1, -1)}</em>);
    else out.push(<Fragment key={i}>{part}</Fragment>);
  });
  return out;
}
export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (bullets.length) {
      nodes.push(
        <ul key={`u${k}`} className="my-1 list-disc space-y-0.5 pl-5 marker:text-muted">
          {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((l, i) => {
    if (/^\s*[-•]\s+/.test(l)) bullets.push(l.replace(/^\s*[-•]\s+/, ""));
    else {
      flush(i);
      if (l.trim()) nodes.push(<p key={i}>{inline(l)}</p>);
    }
  });
  flush(lines.length);
  if (!nodes.length) return null;
  return <div className={clsx("space-y-1 text-[15px] leading-relaxed", className)}>{nodes}</div>;
}

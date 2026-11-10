"use client";
import clsx from "clsx";
import { Fragment, useState, type ReactNode } from "react";
import { presetUri } from "@/lib/ui/covers";
import type { Cover } from "@/lib/domain/types";

export function ProgressBar({ fraction, label, accent = "var(--color-amber)", className }: { fraction: number; label?: string; accent?: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100); // never beyond 100%
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={clsx("h-1.5 overflow-hidden rounded-full bg-white/20", className)}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: accent }} />
    </div>
  );
}

/** Cover background. Falls back gracefully when an image URL is missing or fails to load. */
export function CoverBackground({ cover, accent }: { cover: Cover; accent: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = cover.kind === "url" ? cover.url : cover.kind === "preset" ? presetUri(cover.id) : null;
  if (cover.kind === "color") return <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${cover.color}, color-mix(in srgb, ${cover.color} 55%, #0f0c09))` }} />;
  if (url && failed !== url)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" aria-hidden loading="lazy" onError={() => setFailed(url)} className="absolute inset-0 size-full object-cover" />
    );
  // none or missing image: tasteful tint from the accent colour
  return <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, ${accent} 26%, transparent), transparent 60%), linear-gradient(160deg, #2c261f, #221d18)` }} />;
}
export const hasImage = (c: Cover) => c.kind === "preset" || c.kind === "url" || c.kind === "color";

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
        <ul key={`u${k}`} className="my-1 list-disc space-y-0.5 pl-5 marker:text-amber">
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

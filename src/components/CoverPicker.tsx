"use client";
import clsx from "clsx";
import { Camera, Crop, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { Cover, Focus } from "@/lib/domain/types";
import { COVER_COLORS, COVER_PRESETS, presetUri } from "@/lib/ui/covers";
import { ACCEPT_ATTR, prepareImage, validateImageFile } from "@/lib/ui/images";
import { useImageUrl } from "@/lib/ui/useImage";
import { useApp } from "@/store/app";
import { Check } from "lucide-react";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { Button, Field, inputCls } from "./ui";

type Change = { cover?: Cover; focus?: Focus | undefined };
type Job = { mode: "new"; file: File; src: string } | { mode: "frame"; src: string };

/**
 * Cover choices: your own photo (upload → frame → save), the built-in library, a plain colour, or a photo URL.
 * One framing (focal point + zoom) is kept for every card presentation.
 */
export function CoverPicker({ cover, focus, onChange }: { cover: Cover; focus?: Focus; onChange: (c: Change) => void }) {
  const t = useT();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const planner = useApp((s) => s.planner);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const up = useImageUrl(cover.kind === "upload" ? cover.path : null);

  // free the temporary preview URL of a chosen file
  useEffect(() => () => void (job?.mode === "new" && URL.revokeObjectURL(job.src)), [job]);

  const currentSrc = cover.kind === "upload" ? up.url : cover.kind === "url" ? cover.url : cover.kind === "preset" ? presetUri(cover.id) : null;
  const tile = (active: boolean) => clsx("relative h-14 overflow-hidden rounded-xl border-2 text-sm", active ? "border-accent" : "border-line");
  const hasPhoto = cover.kind === "upload";

  const pick = (file: File | undefined) => {
    setPickError(null);
    if (!file) return;
    const bad = validateImageFile(file);
    if (bad) return setPickError(bad);
    setError(null);
    setJob({ mode: "new", file, src: URL.createObjectURL(file) });
  };

  const confirm = async (f: Focus) => {
    if (!job) return;
    if (job.mode === "frame") {
      onChange({ focus: f });
      return setJob(null);
    }
    if (!planner) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await prepareImage(job.file, (label, pct) => setProgress({ label: label === "reading" ? t("Reading photo") : t("Resizing photo"), pct }));
      setProgress({ label: t("Saving photo"), pct: 85 });
      const path = await planner.repo.putImage(blob);
      setProgress({ label: t("Saving photo"), pct: 100 });
      onChange({ cover: { kind: "upload", path }, focus: f });
      setJob(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Couldn’t save the photo. Check your connection and try again."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted">{t("Cover")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {hasPhoto && (
          <span className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-line bg-bg" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {up.url && <img src={up.url} alt="" className="size-full object-cover" style={{ objectPosition: `${(focus?.x ?? 0.5) * 100}% ${(focus?.y ?? 0.5) * 100}%` }} />}
          </span>
        )}
        <Button variant={hasPhoto ? "outline" : "soft"} onClick={() => fileRef.current?.click()}><Camera size={16} aria-hidden /> {hasPhoto ? t("Replace photo") : t("Upload a photo")}</Button>
        {currentSrc && cover.kind !== "color" && <Button variant="outline" onClick={() => setJob({ mode: "frame", src: currentSrc })}><Crop size={16} aria-hidden /> {t("Adjust framing")}</Button>}
        {hasPhoto && <Button variant="ghost" className="text-danger" onClick={() => onChange({ cover: { kind: "none" }, focus: undefined })}><Trash2 size={16} aria-hidden /> {t("Remove photo")}</Button>}
      </div>
      {hasPhoto && up.status === "missing" && <p role="status" className="text-sm text-muted">{t("This photo isn’t available to you right now. The card falls back to its icon.")}</p>}
      {pickError && <p role="alert" className="text-sm text-danger">{pickError}</p>}
      <p className="text-sm text-muted">{t("JPEG, PNG or WebP. Photos are resized for you and stay private to you and the groups a card is shared with.")}</p>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={t("Photo library")}>
        <button type="button" role="radio" aria-checked={cover.kind === "none"} className={clsx(tile(cover.kind === "none"), "bg-bg")} onClick={() => onChange({ cover: { kind: "none" }, focus: undefined })}>{t("None")}</button>
        {COVER_PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={cover.kind === "preset" && cover.id === p.id} aria-label={t(p.label)} title={t(p.label)} className={tile(cover.kind === "preset" && cover.id === p.id)} onClick={() => onChange({ cover: { kind: "preset", id: p.id } })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={presetUri(p.id)!} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("Plain colour covers")}>
        <span className="text-sm text-muted">{t("Plain colour")}</span>
        {COVER_COLORS.map((c) => {
          const on = cover.kind === "color" && cover.color === c;
          return (
            <button key={c} type="button" role="radio" aria-checked={on} aria-label={t("Colour {color}", { color: c })} onClick={() => onChange({ cover: { kind: "color", color: c }, focus: undefined })} className="grid size-11 place-items-center rounded-full">
              <span className={clsx("grid size-8 place-items-center rounded-full border-2", on ? "border-fg" : "border-line")} style={{ background: c }}>{on && <Check size={14} strokeWidth={3} className="text-fg" />}</span>
            </button>
          );
        })}
      </div>
      <Field label={t("Or a photo URL")} htmlFor={`${id}-url`} hint={t("If it can’t load, the card falls back to its icon.")}>
        <input id={`${id}-url`} className={inputCls} inputMode="url" placeholder="https://…" value={cover.kind === "url" ? cover.url : ""} onChange={(e) => onChange(e.target.value.trim() ? { cover: { kind: "url", url: e.target.value.trim() } } : { cover: { kind: "none" }, focus: undefined })} />
      </Field>

      {job && (
        <PhotoCropDialog
          src={job.src}
          initial={focus}
          title={job.mode === "new" ? t("Frame your photo") : t("Adjust framing")}
          confirmLabel={job.mode === "new" ? t("Use photo") : t("Save framing")}
          busy={busy}
          progress={progress}
          error={error}
          onCancel={() => { setJob(null); setError(null); }}
          onConfirm={(f) => void confirm(f)}
        />
      )}
    </div>
  );
}

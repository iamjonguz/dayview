import type { CSSProperties } from "react";
import { t } from "../i18n";
import type { Focus } from "../domain/types";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");
export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // what we are willing to read from a phone/computer
export const MAX_OUTPUT_BYTES = 1_900_000; // below the storage bucket's 2 MB cap
export const MAX_EDGE = 1280; // longest side after resizing; plenty for a 3× phone thumbnail or a wide cover
export const FOCUS_DEFAULT: Focus = { x: 0.5, y: 0.5, zoom: 1 };

/** Returns a plain-language problem, or null when the file is acceptable. */
export function validateImageFile(f: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(f.type))
    return /heic|heif/i.test(f.type) ? t("That looks like an iPhone HEIC photo. Choose it again from Photos (it converts automatically), or export it as JPEG.") : t("Choose a JPEG, PNG or WebP image.");
  if (f.size === 0) return t("That file is empty.");
  if (f.size > MAX_INPUT_BYTES) return t("That photo is {size} MB. Choose one under {max} MB.", { size: (f.size / 1048576).toFixed(0), max: MAX_INPUT_BYTES / 1048576 });
  return null;
}

/** Scale to fit within `edge` on the longest side, never upscaling. */
export const fitWithin = (w: number, h: number, edge = MAX_EDGE) => {
  const s = Math.min(1, edge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
};

/** CSS for showing an image inside any frame so the chosen focal point stays visible (compact, cover, comfortable). */
export function focusStyle(f?: Focus): CSSProperties | undefined {
  if (!f) return undefined;
  const origin = `${(clamp01(f.x) * 100).toFixed(1)}% ${(clamp01(f.y) * 100).toFixed(1)}%`;
  return { objectPosition: origin, transformOrigin: origin, transform: f.zoom > 1 ? `scale(${Math.min(4, f.zoom)})` : undefined };
}
export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);

export type Stage = "reading" | "resizing" | "uploading";

/** Decode, orient, resize and JPEG-compress a chosen file. Reports coarse progress for the UI. */
export async function prepareImage(file: File, onProgress?: (stage: Stage, pct: number) => void): Promise<Blob> {
  const bad = validateImageFile(file);
  if (bad) throw new Error(bad);
  onProgress?.("reading", 10);
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bmp = await new Promise<HTMLImageElement>((ok, no) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => (URL.revokeObjectURL(url), ok(img));
      img.onerror = () => (URL.revokeObjectURL(url), no(new Error(t("That file couldn’t be read as an image. Try another photo."))));
      img.src = url;
    });
  }
  const sw = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
  const sh = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
  if (!sw || !sh) throw new Error(t("That image has no readable size."));
  onProgress?.("resizing", 40);
  const { width, height } = fitWithin(sw, sh);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("This browser can’t process images."));
  ctx.fillStyle = "#252a32"; // flatten transparency onto the card surface
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, width, height);
  if ("close" in bmp) bmp.close();
  let blob: Blob | null = null;
  for (const q of [0.84, 0.74, 0.64, 0.5]) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_OUTPUT_BYTES) break;
  }
  if (!blob || blob.size > MAX_OUTPUT_BYTES) throw new Error(t("That photo is too detailed to shrink enough. Try a smaller one."));
  onProgress?.("resizing", 70);
  return blob;
}

// Regenerates the PWA icons from scripts/icon.svg:  node scripts/generate-icons.mjs
// Uses `sharp`, which ships with Next.js (not a direct dependency of this project).
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("./icon.svg", import.meta.url));
const out = (p) => new URL(`../${p}`, import.meta.url).pathname;
const targets = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  // The artwork already sits inside the maskable safe zone (central 80%), so one source serves all.
  ["public/icons/maskable-512.png", 512],
  ["src/app/apple-icon.png", 180],
];
for (const [path, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out(path));
  console.log("wrote", path);
}

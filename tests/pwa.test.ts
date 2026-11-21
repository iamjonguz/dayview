import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../src/app/manifest";

const root = join(__dirname, "..");
/** Width and height from a PNG's IHDR chunk. */
const pngSize = (file: string) => {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

describe("PWA manifest", () => {
  const m = manifest();
  it("is installable: name, standalone display, start url inside scope", () => {
    expect(m.name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.start_url?.startsWith(m.scope ?? "/")).toBe(true);
  });
  it("lists 192 and 512 icons plus a maskable one, and every file exists at its declared size", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of icons) {
      const file = join(root, "public", i.src);
      expect(existsSync(file), i.src).toBe(true);
      expect(pngSize(file), i.src).toBe(i.sizes);
    }
  });
  it("ships an Apple touch icon (180x180)", () => {
    expect(pngSize(join(root, "src/app/apple-icon.png"))).toBe("180x180");
  });
});

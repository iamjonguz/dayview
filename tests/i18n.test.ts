import { describe, expect, it } from "vitest";
import { sv } from "../src/lib/i18n/sv/index";
import { translate } from "../src/lib/i18n";
import { formatLong, weekdayShort } from "../src/lib/domain/dates";

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("i18n", () => {
  it("keeps placeholders identical in every Swedish entry", () => {
    for (const [en, s] of Object.entries(sv)) expect(vars(s), en).toBe(vars(en));
  });
  it("interpolates and falls back to English", () => {
    expect(translate("en", "Hi {n}", { n: 2 })).toBe("Hi 2");
    expect(translate("sv", "Not in dictionary")).toBe("Not in dictionary");
    expect(translate("sv", "Today")).toBe("Idag");
  });
  it("formats dates in English by default", () => {
    expect(formatLong("2026-11-10")).toBe("Tuesday, November 10");
    expect(weekdayShort(0)).toBe("Sun");
  });
});

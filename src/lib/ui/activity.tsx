import { BookOpen, Briefcase, Car, Coffee, Dumbbell, Footprints, GraduationCap, Heart, House, Moon, Music, Phone, Pill, ShoppingBasket, Sparkles, Sunrise, Utensils, type LucideIcon } from "lucide-react";
import { ACCENTS, isLegacyAccent } from "../domain/factory";
import type { CardSpec } from "../domain/types";

/** Activity icons: a small, consistent set. A card can pick one; otherwise it is inferred from the title. */
export const ACTIVITY_ICONS: Record<string, { label: string; Icon: LucideIcon; color: string; words: RegExp }> = {
  morning: { label: "Morning", Icon: Sunrise, color: "#f2c46d", words: /morning|wake|routine|breakfast|coffee|start/i },
  work: { label: "Work", Icon: Briefcase, color: "#8ec5f0", words: /work|meeting|project|office|email|focus|call/i },
  meal: { label: "Meal", Icon: Utensils, color: "#ff9b82", words: /dinner|lunch|meal|cook|supper|brunch|eat/i },
  exercise: { label: "Exercise", Icon: Dumbbell, color: "#c9d97a", words: /exercise|workout|gym|run|yoga|training|stretch/i },
  walk: { label: "Walk", Icon: Footprints, color: "#7fd1d1", words: /walk|hike|steps|stroll/i },
  reading: { label: "Reading", Icon: BookOpen, color: "#b7a6f0", words: /read|book|study|journal|write/i },
  shopping: { label: "Shopping", Icon: ShoppingBasket, color: "#f0a0c8", words: /grocer|shop|errand|buy|store/i },
  home: { label: "Home", Icon: House, color: "#f2c46d", words: /clean|laundry|chore|home|tidy|dish/i },
  sleep: { label: "Evening", Icon: Moon, color: "#b7a6f0", words: /sleep|bed|wind down|night/i },
  health: { label: "Health", Icon: Pill, color: "#ff8493", words: /medic|pill|vitamin|doctor|health|dentist/i },
  learn: { label: "Learning", Icon: GraduationCap, color: "#8ec5f0", words: /learn|class|course|lesson|homework/i },
  social: { label: "People", Icon: Phone, color: "#f0a0c8", words: /friend|family|phone|visit|party/i },
  music: { label: "Music", Icon: Music, color: "#b7a6f0", words: /music|practice|piano|guitar|sing/i },
  care: { label: "Self-care", Icon: Heart, color: "#ff8493", words: /care|relax|meditat|spa|rest/i },
  travel: { label: "Travel", Icon: Car, color: "#8ec5f0", words: /drive|commute|travel|trip|pick up|drop/i },
  coffee: { label: "Break", Icon: Coffee, color: "#f2c46d", words: /^$/ },
  other: { label: "General", Icon: Sparkles, color: ACCENTS[0], words: /^$/ },
};
export const ICON_KEYS = Object.keys(ACTIVITY_ICONS);

export function activityIconKey(spec: Pick<CardSpec, "title" | "icon">): string {
  if (spec.icon && ACTIVITY_ICONS[spec.icon]) return spec.icon;
  const hit = ICON_KEYS.find((k) => ACTIVITY_ICONS[k].words.test(spec.title));
  return hit ?? "other";
}

/** Icon + colour for a card. Cards still on an old default accent take the colour of their activity type. */
export function activityStyle(spec: Pick<CardSpec, "title" | "icon" | "accent">) {
  const key = activityIconKey(spec);
  const meta = ACTIVITY_ICONS[key];
  return { key, Icon: meta.Icon, label: meta.label, color: isLegacyAccent(spec.accent) ? meta.color : spec.accent };
}

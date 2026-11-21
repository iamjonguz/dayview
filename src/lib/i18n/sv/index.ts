import { core } from "./core";
import { editor } from "./editor";
import { groups } from "./groups";
import { shell } from "./shell";
import { today } from "./today";

/** Swedish translations, keyed by the English source text. Split by area to keep files reviewable. */
export const sv: Record<string, string> = { ...shell, ...today, ...editor, ...groups, ...core };

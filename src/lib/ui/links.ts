import type { DateStr, ID } from "../domain/types";

export const DATE_PARAM = "date";
export const ACTIVITY_PARAM = "card";

/** Link to a day, optionally to one dated card on it (by its stable instance id). */
export function dayHref(date: DateStr, cardId?: ID): string {
  const q = new URLSearchParams({ [DATE_PARAM]: date });
  if (cardId) q.set(ACTIVITY_PARAM, cardId);
  return `/?${q.toString()}`;
}

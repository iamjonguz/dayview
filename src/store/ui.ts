"use client";
import { create } from "zustand";
import type { DateStr, ID } from "@/lib/domain/types";

export type EditorTarget =
  | { kind: "create"; date: DateStr; sectionId?: ID | null; templateId?: ID }
  | { kind: "edit"; instanceId: ID }
  | null;

const COLLAPSE_KEY = "dayview.view.collapseDone";
const readBool = (k: string) => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};

interface UiState {
  /** Group completed cards into a collapsed "Done" section (persisted per device). */
  collapseDone: boolean;
  setCollapseDone(b: boolean): void;
  editor: EditorTarget;
  searchOpen: boolean;
  setSearchOpen(o: boolean): void;
  openCreate(date: DateStr, opts?: { sectionId?: ID | null; templateId?: ID }): void;
  openEdit(instanceId: ID): void;
  closeEditor(): void;
}
export const useUi = create<UiState>((set) => ({
  collapseDone: readBool(COLLAPSE_KEY),
  setCollapseDone: (collapseDone) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapseDone ? "1" : "0");
    } catch {}
    set({ collapseDone });
  },
  editor: null,
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openCreate: (date, opts) => set({ editor: { kind: "create", date, ...opts } }),
  openEdit: (instanceId) => set({ editor: { kind: "edit", instanceId } }),
  closeEditor: () => set({ editor: null }),
}));

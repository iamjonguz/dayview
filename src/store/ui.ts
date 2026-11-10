"use client";
import { create } from "zustand";
import type { DateStr, ID } from "@/lib/domain/types";

export type EditorTarget =
  | { kind: "create"; date: DateStr; sectionId?: ID | null; templateId?: ID }
  | { kind: "edit"; instanceId: ID }
  | null;

interface UiState {
  editor: EditorTarget;
  searchOpen: boolean;
  setSearchOpen(o: boolean): void;
  openCreate(date: DateStr, opts?: { sectionId?: ID | null; templateId?: ID }): void;
  openEdit(instanceId: ID): void;
  closeEditor(): void;
}
export const useUi = create<UiState>((set) => ({
  editor: null,
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openCreate: (date, opts) => set({ editor: { kind: "create", date, ...opts } }),
  openEdit: (instanceId) => set({ editor: { kind: "edit", instanceId } }),
  closeEditor: () => set({ editor: null }),
}));

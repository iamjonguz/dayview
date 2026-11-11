"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { resolveImage } from "./imageCache";

/** A readable URL for an uploaded photo, honouring the same access rules as the stored data. */
export function useImageUrl(path: string | null | undefined): { url: string | null; status: "none" | "loading" | "ready" | "missing" } {
  const planner = useApp((s) => s.planner);
  const me = useApp((s) => s.ws?.me.id);
  const key = path && me ? `${me}|${path}` : "";
  const [res, setRes] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!key || !planner || !path) return;
    let live = true;
    void resolveImage(planner.repo, key, path).then((url) => live && setRes({ key, url }));
    return () => void (live = false);
  }, [key, path, planner]);
  if (!path) return { url: null, status: "none" };
  const cur = res && res.key === key ? res : null;
  return { url: cur?.url ?? null, status: cur ? (cur.url ? "ready" : "missing") : "loading" };
}

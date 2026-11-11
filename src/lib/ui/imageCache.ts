import type { Repo } from "../data/repo";

const TTL = 45 * 60 * 1000; // signed URLs last an hour; refresh before they lapse
const cache = new Map<string, { at: number; p: Promise<string | null> }>();
/** Forget resolved photo URLs (e.g. after switching the demo "viewing as" person, when access can change). */
export const clearImageCache = () => cache.clear();

export function resolveImage(repo: Repo, key: string, path: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = repo.getImageUrl(path).catch(() => null);
  cache.set(key, { at: Date.now(), p });
  return p;
}


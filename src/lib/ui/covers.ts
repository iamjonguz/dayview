/**
 * Built-in covers: a few natural photographs (public/covers) plus quiet gradients. Every preset has a gradient too,
 * used when a photo can't load. Ids are unchanged from earlier versions so saved cards keep their cover.
 * Your own photos can be used via an image URL.
 */
const PRESETS: Record<string, { label: string; a: string; b: string; photo?: string }> = {
  dawn: { label: "Morning light", a: "#566672", b: "#2c373f", photo: "/covers/dawn.jpg" },
  desk: { label: "Desk", a: "#444c52", b: "#24292c", photo: "/covers/desk.jpg" },
  soup: { label: "Soup", a: "#8c6d5e", b: "#4b3932", photo: "/covers/soup.jpg" },
  plate: { label: "Dinner plate", a: "#918b78", b: "#524e43", photo: "/covers/plate.jpg" },
  trail: { label: "Forest trail", a: "#5a7560", b: "#2d4033", photo: "/covers/trail.jpg" },
  book: { label: "Book", a: "#71607a", b: "#382e3f", photo: "/covers/book.jpg" },
  ember: { label: "Rust", a: "#9c6549", b: "#563628" },
  moss: { label: "Sage", a: "#82997a", b: "#43533e" },
  dusk: { label: "Dusk", a: "#5e6888", b: "#2e3450" },
};

export const COVER_PRESETS = Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label }));
export const presetColors = (id: string) => PRESETS[id] ?? null;
export const presetPhoto = (id: string) => PRESETS[id]?.photo ?? null;
export const presetGradient = (id: string) => {
  const p = PRESETS[id];
  if (!p) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient></defs><rect width="400" height="260" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
export const COVER_COLORS = ["#3a4a43", "#3d4452", "#4a3f4f", "#4d4439", "#3b3b3b", "#2f4a56"];
/** Preferred image for a preset: its photograph when it has one, otherwise the gradient. */
export const presetUri = (id: string) => presetPhoto(id) ?? presetGradient(id);

/** Built-in cover illustrations: warm, abstract SVG scenes (no external image dependencies). */
const wrap = (body: string, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" preserveAspectRatio="xMidYMid slice"><defs>${defs}<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter><filter id="b2"><feGaussianBlur stdDeviation="3"/></filter></defs>${body}</svg>`;

const SCENES: Record<string, { label: string; svg: string }> = {
  dawn: {
    label: "Morning window",
    svg: wrap(
      `<rect width="800" height="520" fill="url(#g)"/><circle cx="560" cy="170" r="120" fill="#ffd9a0" opacity=".75" filter="url(#b)"/>
<rect x="430" y="60" width="260" height="250" rx="6" fill="#ffe7c2" opacity=".55"/><path d="M560 60v250M430 185h260" stroke="#7a5230" stroke-width="8"/>
<g fill="#4c6a3a" opacity=".9"><ellipse cx="660" cy="330" rx="26" ry="70" transform="rotate(-25 660 330)"/><ellipse cx="700" cy="320" rx="22" ry="62" transform="rotate(20 700 320)"/><ellipse cx="680" cy="300" rx="20" ry="64"/></g>
<rect x="640" y="380" width="80" height="80" rx="10" fill="#6b4328"/>
<path d="M0 440c160-40 300-10 460-30s240 20 340-10v130H0z" fill="#2b1f17" opacity=".85"/><ellipse cx="190" cy="430" rx="70" ry="20" fill="#e9c79a" opacity=".5"/>`,
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b3b26"/><stop offset="1" stop-color="#d79a55"/></linearGradient>`,
    ),
  },
  desk: {
    label: "Desk & lamp",
    svg: wrap(
      `<rect width="800" height="520" fill="url(#g)"/><circle cx="170" cy="130" r="170" fill="#ffb95e" opacity=".5" filter="url(#b)"/>
<path d="M120 230l50-110 60 20-35 100z" fill="#2a2018"/><circle cx="165" cy="115" r="30" fill="#ffcf85"/>
<path d="M300 360l60-170h300l60 170z" fill="#1d1b1a"/><path d="M310 350l55-150h285l55 150z" fill="#33302c"/><rect x="270" y="360" width="500" height="22" rx="8" fill="#8f8b86"/>
<rect x="0" y="400" width="800" height="120" fill="#4a2f1b"/><rect x="520" y="430" width="180" height="26" rx="4" fill="#e8dcc6" opacity=".85"/><path d="M540 436l130-8" stroke="#2b2118" stroke-width="5"/>
<rect x="90" y="400" width="56" height="50" rx="8" fill="#c7a77e"/>`,
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1d14"/><stop offset="1" stop-color="#6a4326"/></linearGradient>`,
    ),
  },
  soup: {
    label: "Bowl of soup",
    svg: wrap(
      `<rect width="800" height="520" fill="url(#g)"/><ellipse cx="400" cy="320" rx="230" ry="150" fill="#d8cdbc"/><ellipse cx="400" cy="310" rx="200" ry="125" fill="#f0e6d4"/>
<ellipse cx="400" cy="308" rx="170" ry="100" fill="#c9542a"/><ellipse cx="400" cy="300" rx="140" ry="76" fill="#e2733a" opacity=".8"/>
<g fill="#5e8a3c"><ellipse cx="400" cy="296" rx="22" ry="9"/><ellipse cx="380" cy="290" rx="14" ry="6" transform="rotate(30 380 290)"/><ellipse cx="420" cy="290" rx="14" ry="6" transform="rotate(-30 420 290)"/></g>
<path d="M610 300l120-60 60 140-130 60z" fill="#d2a46a"/><path d="M630 310l100-48 40 100-104 48z" fill="#ecd3a4"/>
<path d="M120 80c30 30-30 50 0 90M180 60c30 30-30 50 0 90" stroke="#ffe6c4" stroke-width="6" fill="none" opacity=".35" filter="url(#b2)"/>`,
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2a1d"/><stop offset="1" stop-color="#7d5430"/></linearGradient>`,
    ),
  },
  plate: {
    label: "Dinner plate",
    svg: wrap(
      `<rect width="800" height="520" fill="url(#g)"/><ellipse cx="400" cy="290" rx="300" ry="190" fill="#cfc4b2"/><ellipse cx="400" cy="285" rx="262" ry="160" fill="#ebe1cf"/>
<path d="M250 300c20-70 140-100 220-60 40 20 30 80-20 100-70 28-190 10-200-40z" fill="#e0793f"/><path d="M280 290c40-30 130-40 170-10" stroke="#f1a46d" stroke-width="9" fill="none"/>
<g fill="#f6f1e7">${Array.from({ length: 28 }, (_, i) => `<ellipse cx="${470 + (i % 7) * 20 + ((i / 7) | 0) * 6}" cy="${250 + ((i / 7) | 0) * 18}" rx="9" ry="5"/>`).join("")}</g>
<g fill="#4f7b33"><circle cx="560" cy="200" r="34"/><circle cx="600" cy="230" r="30"/><circle cx="535" cy="235" r="26"/></g>
<path d="M300 380l60-28 30 40-52 26z" fill="#f4d34a"/>`,
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1e15"/><stop offset="1" stop-color="#6b4a2c"/></linearGradient>`,
    ),
  },
  trail: {
    label: "Forest trail",
    svg: wrap(
      `<rect width="800" height="520" fill="url(#g)"/><path d="M330 0l60 0 120 520H190z" fill="#ffe3a8" opacity=".35" filter="url(#b)"/>
<g fill="#2c2418"><rect x="40" y="0" width="46" height="520"/><rect x="170" y="0" width="30" height="470"/><rect x="620" y="0" width="52" height="520"/><rect x="730" y="0" width="34" height="500"/><rect x="540" y="0" width="22" height="440"/></g>
<path d="M380 520c20-120 10-170 20-230 60 20 90 130 190 230z" fill="#a8733a" opacity=".9"/><path d="M0 470c200-60 330-10 460-50s240 20 340-20v120H0z" fill="#3d4a24" opacity=".8"/>`,
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c8a43"/><stop offset=".6" stop-color="#4f5a2a"/><stop offset="1" stop-color="#2f2f18"/></linearGradient>`,
    ),
  },
  book: {
    label: "Reading nook",
    svg: wrap(
      `<rect width="800" height="520" fill="url(#g)"/><circle cx="690" cy="90" r="150" fill="#ffc26e" opacity=".55" filter="url(#b)"/><rect x="640" y="40" width="70" height="110" rx="10" fill="#e6b472"/>
<rect x="110" y="110" width="76" height="70" rx="12" fill="#c9a77d"/>
<path d="M200 380l190-60 10 130-190 30z" fill="#efe3cb"/><path d="M410 320l190 60-10 130-190-30z" fill="#e6d7b9"/><path d="M400 320v130" stroke="#7b5a35" stroke-width="6"/>
<g stroke="#a89572" stroke-width="3" opacity=".7"><path d="M220 395l150-45M222 415l150-45M224 435l150-45M430 350l150 45M430 370l150 45M430 390l150 45"/></g>
<path d="M0 470c150-30 300 20 450-10s240 10 350-10v70H0z" fill="#4a3322" opacity=".8"/>`,
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3c2c20"/><stop offset="1" stop-color="#8a6240"/></linearGradient>`,
    ),
  },
  ember: {
    label: "Ember glow",
    svg: wrap(`<rect width="800" height="520" fill="url(#g)"/><circle cx="600" cy="120" r="200" fill="#ffb25e" opacity=".35" filter="url(#b)"/>`, `<linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2b1d14"/><stop offset="1" stop-color="#9a5f2d"/></linearGradient>`),
  },
  moss: {
    label: "Moss",
    svg: wrap(`<rect width="800" height="520" fill="url(#g)"/><circle cx="180" cy="380" r="220" fill="#9bb46a" opacity=".25" filter="url(#b)"/>`, `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f261a"/><stop offset="1" stop-color="#56673a"/></linearGradient>`),
  },
  dusk: {
    label: "Dusk",
    svg: wrap(`<rect width="800" height="520" fill="url(#g)"/><circle cx="640" cy="130" r="90" fill="#f4c88a" opacity=".5" filter="url(#b)"/>`, `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2540"/><stop offset="1" stop-color="#8b5a4a"/></linearGradient>`),
  },
};

export const COVER_PRESETS = Object.entries(SCENES).map(([id, s]) => ({ id, label: s.label }));
export const presetUri = (id: string) => {
  const s = SCENES[id];
  return s ? `data:image/svg+xml;utf8,${encodeURIComponent(s.svg)}` : null;
};
export const COVER_COLORS = ["#4a3322", "#3f4a2c", "#2d3f4a", "#4a2d3c", "#463f2a", "#3a3a3a"];

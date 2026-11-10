# Dayview

A calm, mobile-first planner built from customizable activity cards. Next.js 16 · TypeScript · Tailwind 4 · Radix primitives · Supabase (optional).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000 — demo mode, no setup needed
npm test           # recurrence, progress, history, sharing + real RLS tests
npm run lint && npx tsc --noEmit && npm run build
```

## Demo mode (default)

With no Supabase variables the app runs on a local store (`localStorage`), seeded with a realistic day: a morning routine, work, lunch, exercise, a **Family-shared dinner**, and reading, plus a little history and two saved day layouts. Everything is editable and survives reloads. A banner marks demo mode.

**Sharing across accounts needs the backend.** In demo mode the Family group, Maja and Erik are *simulated members stored on this device*. Settings → "Viewing as" lets you preview the day as each of them (shared vs individual completion, independent ordering). It is a local simulation, not collaboration. The demo store still enforces the same permission rules as the database.

## Backend (Supabase)

1. Create a Supabase project.
2. Apply the migration in `supabase/migrations/` (SQL editor, or `supabase db push`).
3. Auth → keep **Confirm email** enabled (invitations are matched to the confirmed email in the JWT).
4. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key only — no service key is used or needed).
5. `npm run dev`, create an account, then use Groups → invite by email.

Authorization is row-level security: private cards are owner-only; group cards are visible to members; editors/owners edit shared content; completion writes depend on the mode (`together` → editors write one shared record, `individual` → each member writes only their own); placement/visibility rows are strictly per user; invitations are accepted only through `respond_invitation()` by the addressed email and can be revoked. Cards use optimistic concurrency (`rev`); progress uses merge-patching so two people ticking different items don't overwrite each other. Realtime subscriptions plus focus/poll refresh keep views current.

## Architecture

- `src/lib/domain` — pure model: types, dates (timezone-safe `YYYY-MM-DD` arithmetic), recurrence, progress rules, permissions, day-view building, starters.
- `src/lib/data` — `Repo` interface; `LocalRepo` (demo) and `SupabaseRepo`; `Planner` holds all product logic (materialising routine days once, edit scopes, skips, layouts, groups).
- Cards = `CardSpec` with ordered blocks (note, checklist, numeric target, responsibilities) with stable ids. Block *definitions* live in the card; *state* (checks, values, completion) lives in per-scope progress records. Routines, templates and layouts are separate from dated card instances, which are snapshots.
- Editing a routine "this and future" splits it at that date; past instances are never rewritten. "This day only" edits one instance. Skipping keeps a tombstone so the day isn't regenerated.

## What was verified

- `npm test`: 50 tests — recurrence/DST/timezone, no duplicate instances (concurrent loads), skip, progress rules (notes-only never complete, clamp at 100%), historical isolation, shared vs individual completion, independent personal ordering/hiding, stale-edit detection, invitations, and **the real SQL migration run in an in-process Postgres (PGlite) with RLS exercised as owner/editor/viewer/outsider/anonymous**.
- Manually in a browser: phone-width (390px) and desktop layouts, complete / flip / add / persistence after reload, single card face in the DOM with focus moved to the new control.

## Design system

Colours live only as semantic tokens in `src/app/globals.css` (`bg`, `nav`, `surface`, `surface-2`, `line`, `fg`, `muted`, `accent`, `accent-ink`, `danger`, `focus`); components never use raw colours. Focus uses its own blue ring so it can't be mistaken for "selected" (sage). Branding is in `src/lib/brand.ts` (override the name with `NEXT_PUBLIC_APP_NAME`). Serif is used only for page titles.

Card size: each person has a day-view preference (Compact / Comfortable, saved in their preferences; new accounts default to Compact). A card set to "always compact" stays compact, and a per-card choice from the card menu wins over both. Existing preferences are never rewritten. Cards saved with the old default amber accent follow the theme accent; any deliberately chosen colour is kept. Built-in covers are neutral gradients (old preset ids still resolve); use a photo URL for real imagery.

Screenshots: `docs/screenshots/`.

## Limitations / not done

- **Not tested against a live Supabase project** (no credentials here). The SQL/RLS is tested in PGlite; `SupabaseRepo`, auth UI and realtime are type-checked only.
- Invitation delivery is in-app only (no emails are sent): invitees see it after signing in with the invited address.
- Recurring routines are personal; share an individual day's card instead.
- Covers are built-in illustrations, a plain colour, or an image URL (no uploads).
- Software-keyboard behaviour is configured (`interactive-widget=resizes-content`, full-screen editor with a sticky Save bar) but was not tested on a real phone. Reduced-motion is implemented in CSS but was not exercised in a browser.
- Drag-and-drop is in "Arrange" mode (handle + keyboard); up/down buttons and section menus work without dragging. Not exhaustively screen-reader tested.

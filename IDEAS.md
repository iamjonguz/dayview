# Dayview: ideas for later

Not planned or scheduled. A backlog to pick from. Keep the product's tone in mind: calm, personal, no streak pressure, no gamification.

## Suggested first batch

1. Shared recurring routines (biggest gap in groups today)
2. Installable PWA with offline-first sync and opt-in notifications
3. Week view
4. Calendar sync
5. Natural-language quick add

## Smarter planning
- **Natural-language quick add.** "Dentist Thursday 14:30 remind 1h before" becomes a card. Local parsing first, an LLM for messy input later.
- **AI day assistant.** "Plan my week around three workouts and a Friday deadline" proposes cards and layouts. The user approves each; nothing is applied silently.
- **Auto-scheduling.** Suggest slots for untimed tasks around timed cards, based on how long similar cards took.
- **Time budgeting.** Optional estimates per card and a gentle "this day looks full" hint. No red warnings.
- **Conflict detection.** Flag overlapping timed cards, including shared ones.
- **Smart templates.** Notice repeated card creation and offer to turn it into a routine.

## Richer cards
- **More block types:** timers and stopwatches, photo galleries, links with previews, location and map, habit-style counters, ratings and mood check-ins, voice notes with transcription, file attachments.
- **Linked blocks.** A recipe block that fills the ingredients checklist; a shopping list that merges ingredients from several dinners.
- **Formulas and rollups.** A weekly "pages read" total pulled from daily reading cards.
- **Sub-cards and dependencies.** "Pick up groceries" must happen before "Dinner".
- **Card history.** View and restore earlier versions of a shared card (revision numbers already exist).
- **Comments and reactions** on shared cards, with @mentions limited to group members.

## Time and reflection
- **Week and month views.** A planning view alongside the day view, with drag between days.
- **Calendar sync.** Two-way sync with Google, Apple and Outlook. Imported events appear as read-only cards.
- **Weather and daylight on cards.** Useful for exercise and outdoor plans.
- **Journal and end-of-day review.** A short optional prompt. Insights stay descriptive ("you read on 5 of 7 evenings"), never scored.
- **Seasons and focus modes.** "Holiday week" or "exam period" layouts that swap in temporarily and revert automatically.

## Sharing and collaboration
- **Shared recurring routines** with proper generation for viewers (needs a backend decision: server-side materialization via RPC or scheduled job, so viewers aren't blocked by RLS).
- **Rotating responsibilities.** "Cooking" rotates weekly among members, with swap requests.
- **Live presence and co-editing** on shared cards, with conflict-free merging (CRDTs) instead of conflict prompts.
- **Public or read-only share links** for a single card, such as a trip itinerary. Revocable and expiring.
- **Group templates** that members can adopt into their own library.
- **Per-member notification preferences.**
- **Invitation emails** via a Supabase Edge Function (service key stays server-side).

## Platform and reach
- **Installable PWA with offline-first sync.** Edits queue locally and merge on reconnect.
- **Native widgets** for lock screen and home screen: next card, today's progress.
- **Push notifications and email digests** (morning summary, evening nudge), all opt-in.
- **Voice assistants and shortcuts.** "Hey Siri, mark dinner done."
- **Wearable companion.** Tap to complete or log numeric targets from a watch.
- **Email-to-card and share-sheet capture.** Forward a booking confirmation to get a populated card.
- **Public API and webhooks,** plus Zapier or Make integrations.
- **Import and export:** JSON and CSV, iCal, and imports from Todoist, Notion and Apple Reminders.
- **Cover image upload** via Supabase Storage (bucket plus policies; size-limited data URLs in demo mode).
- **Browser reminders** for timed cards (works only while the app is open).

## Personalization
- **Theme engine.** Light theme, high-contrast and dyslexia-friendly modes, accent palettes per section.
- **Custom card front layouts.** Keep it limited; the brief warns against building a design tool.
- **Localization,** including right-to-left and configurable week start.
- **Accessibility depth.** Full screen-reader audit, reduced-cognitive-load mode, voice control.

## Data and trust
- **End-to-end encrypted private cards,** so even the server can't read them.
- **Audit log for groups:** who changed what, and when.
- **Team or organization workspaces** with SSO, if the product grows beyond personal and family use.
- **Self-hosting guide** and one-command Docker setup.

## Cautions
- Avoid streaks, leaderboards, productivity scores and "you missed N days" reports.
- If analytics are added, keep them descriptive and private by default.

## Known gaps in the current build (not new ideas)
- Not tested against a live Supabase project (SupabaseRepo, auth UI, realtime).
- Arrange drag-and-drop, reduced-motion behavior and some editor flows were not exercised in a browser.
- No screen-reader or formal contrast audit.
- Desktop stacks sections vertically instead of the three-column layout in the reference image.

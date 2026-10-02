# Nearby Notices — "Watch this place"

**Feature: user-chosen geofenced notifications for Registry landmarks**

## Goal

Turn curiosity into a visit: the reader turns down the page for a place —
"Watch this place" — and the guide quietly tells them, next time they are
near it with the phone in pocket or bag, that the place is close by. Tapping
the notice opens the entry; walking up and standing there earns the stamp.

This is the external trigger for the existing stamp-collection loop, built
entirely on the reader's own choosing: no landmark is ever announced unless
the reader asked to watch it.

## V1 — "Watch this place" (the watchlist)

### Core behavior

1. **Watch toggle** on every Registry entry (`app/landmark/[id].tsx`) and as
   a slip in the Registry index. Copy: **"Watch this place"**; watching
   state shown as a small vermilion mark on the entry, the index row, and
   the map marker.
2. Watching registers an **OS geofence** (CLCircularRegion on iOS /
   Geofencing on Android) sized from `lib/arrival.ts` (`VISIT_RADIUS_M`:
   60 m building, 300 m district). Fires with the app closed — no push
   server, no network. All logic on-device.
3. **Firing:** when the fence is entered, send a local notification in the
   guide's voice. "You're at the door of the Chamber of Commerce — a
   Maybeck." No emojis, no exclamation points. Tapping deep-links to the
   landmark entry with the map framed on it.
4. **Retirement:** a watch retires when it fires and is tapped, or when the
   place is stamped (arrival detection while walking, as today). Retired
   watches move to the Stamps page — the arc is watch → go → stamped.
5. **Quiet lapse:** watches expire after 6 months; the entry asks "still
   watching?" rather than renewing silently. Keeps the list — and the
   geofences — fresh. The prompt surfaces on entry visit only, never as a
   notification. Fallback: a watch untouched for 12 months total is retired
   quietly during fence sync — stale fences shouldn't hold slots forever.
6. **Distance-honest copy:** building fences (60 m) say "at the door of…";
   district fences (300 m) say "you're walking the edge of…" — a template
   branch on landmark type, so a two-blocks-early district fire reads as
   intended, not as a bug.

### The watchlist

- A **"Places you're watching"** slip on the Stamps page (Appendix), beside
  the collection it feeds.
- **Cap: 20 places.** This matches iOS's 20-region monitoring limit; keep 20
  as a product constant (`MAX_WATCHES`) on both platforms, not a platform
  error. Phrase it in copy: "A reader's fullest case holds twenty watches."
  Attempting a 21st offers to let them retire one.
- No per-landmark re-fire: after a watch fires and is tapped, it is retired
  (not re-armed) unless the reader re-watches.
- **Watch states:** the ledger carries `status: watching | fired | retired`.
  On fire, status becomes `fired`; the Stamps-page slip shows fired watches
  with secondary copy ("waiting at the door") so the arc reads watch → go →
  stamped. Tap or stamp retires; a fired-but-ignored watch stays listed but
  muted (30-day re-fire block). Re-watching from the entry re-arms it.

### Throttles (safety net — the watchlist is the primary control)

- Max **1 fired notification per hour** and **3 per day** globally, even
  across multiple watches. Overflow is dropped, not queued.
- A fired-and-dismissed (not tapped) watch does not re-fire for 30 days.
- Respect Do Not Disturb / Focus (default OS behavior, no workarounds).
- **Stamp suppresses notice:** before posting a notification, check whether
  the place stamped within the last 10 minutes (arrival detection already
  knows). If so, retire the watch silently — the stamp *is* the payoff.
  Handles the reader walking up with the app open.
- **Fence sync:** on every app open, reconcile registered OS regions against
  the ledger and re-register anything missing (covers reboot, OS eviction,
  and updates; idempotent). Android additionally re-registers in a
  `BOOT_COMPLETED` receiver. Stated in About: "Fences re-arm automatically;
  after a restart the first notice may wait until the guide is next opened."

### Permissions & privacy

- Watching asks for location **"Always"** (background geofencing needs it),
  asked at the moment of intent — the reader has just chosen a place, so
  the prompt reads as service, not surveillance.
- All processing on-device. **No push tokens, no network calls, no
  analytics.** The watchlist and its ledger stay in the existing local
  reader-copy store: `{landmarkId, watchedAt, lastFiredAt, firedCount, status}`.
- Update `app/about.tsx`: "The guide tells you a place is close by only if
  you asked it to — only from this phone, nothing sent anywhere. No
  tracking."
- Degradation: if location is denied or unavailable, watching still works
  as a bookmark (kept, listed, no notifications) — never an error state.

### Acceptance criteria (V1)

- [ ] Watch toggle on entry + index; vermilion mark in all three surfaces
- [ ] Geofence fires with app closed; tap deep-links to entry, map framed
- [ ] Watch retires on tap-through or stamp; moves to Stamps page state
- [ ] 21st watch offers retirement flow; 20 geofences actually registered
- [ ] 1/hour, 3/day global caps hold across restarts (ledger persisted)
- [ ] 6-month lapse with "still watching?" prompt
- [ ] Zero network calls introduced; no new permission besides Always-at-intent
- [ ] Degrades to bookmark when location denied
- [ ] Fence sync reconciles ledger ↔ registered regions on every app open
- [ ] Stamp within 10 min suppresses the notice and retires the watch
- [ ] District fires use "edge of…" copy; building fires use "at the door of…"
- [ ] 12-month-untouched watches retire quietly during sync

## Phase 2 (optional, later) — the automatic tier

Novelty-driven automatic notices for places the reader has *not* found:
opt-in separately ("Nearby notices"), off by default. If built:

- Dwell/velocity filter (walking pace or stopped; Visit Monitoring API) —
  never fire on drive-bys.
- One per landmark per year; 30-day district cooldown; global budget
  1/week, 4/month, no rollover.
- Two dismissals in a row → halve frequency for a month.
- Local-facing copy leads with story, not proximity: "You've passed the
  Freight and Salvage a hundred times. It started as a luggage shop."
- Requires region-monitoring strategy beyond 20 fences (district centroids
  as tripwires; re-armor from foreground fixes).

Ship V1 alone first; it is most of the value with none of the spam risk.

# Google Calendar sync

Kairos overlays read-only Google Calendar events on the schedule. It's **multi-calendar**
(attach a work calendar, a personal calendar, more) and each calendar carries a **label**
you choose, so its events read as `#work` / `#personal` time on the grid.

There is **no OAuth and no Google Cloud project**. Each calendar is attached by its
*secret address in iCal format* — a private `.ics` URL Google generates per calendar.

## How it works

- Settings → **Calendars** holds the attached calendars (name, secret iCal URL, label, on/off).
- A sync fetches each enabled feed, expands recurring events (RRULE/EXDATE/overrides) with
  [ical.js](https://github.com/kewisch/ical.js), and reconciles them into `scheduled_blocks`
  as `source = 'gcal'` rows over a window of **today − 7 days … today + 60 days**.
- Sync runs **on a 10-minute staleness check** when a page loads, and on demand via **Sync now**.
  A normal page load inside the window does no network: it just reads the DB.
- Google events are **read-only**: you can't drag, resize, edit, or delete them in Kairos.
  They may **overlap** your time-blocks freely (the no-overlap constraint exempts `gcal`).
- They **do** count as busy for free-slot suggestions and the booked/open day stats.
- Visually they wear a cool graphite wash (not the amber of your own blocks) and a small
  calendar mark in the corner.

## Attaching a calendar (e.g. the Tkxel work calendar)

1. Open **Google Calendar** on the web (calendar.google.com) signed in to the account that
   owns the calendar.
2. In the left sidebar under **My calendars**, hover the calendar, click the **⋮** menu →
   **Settings and sharing**.
3. Scroll to **Integrate calendar**. Copy **Secret address in iCal format** (it ends in
   `…/basic.ics`). Treat it like a password — anyone with it can read your events.
4. In Kairos, go to **Settings → Calendars → add calendar**:
   - **Name**: e.g. `Work`
   - **Label**: e.g. `tkxel` (lowercase letters, digits, `-`, `_`)
   - **URL**: paste the secret iCal address
   - **Attach**, then **Sync now**.
5. Repeat for the personal calendar (Name `Personal`, label `personal`).

### Workspace caveat (Tkxel)

Tkxel is a Google Workspace org. An admin can **disable the secret iCal address** org-wide.
If "Secret address in iCal format" is missing, blank, or the feed returns an error in Kairos,
the admin has turned it off — the paste-a-URL path can't work for that calendar, and a
full OAuth integration (not built) would be required. Personal Gmail calendars are unaffected.

## Notes

- The secret URL is stored server-side only and never sent to the browser (the settings UI
  shows a masked `host/…/basic.ics`). Like every other secret in this repo, never commit it.
- Disabling a calendar clears its events from the grid; re-enabling re-syncs them.
- Detaching a calendar removes its events via an `ON DELETE CASCADE`.
- Events outside the ±window simply don't appear; navigating far past/future shows nothing
  from Google there.

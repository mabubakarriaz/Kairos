# Product

## Register

product

## Users

A single user, the project's author, using Kairos as a personal time-blocking tool. No accounts, no sharing, no teams. The app gets opened multiple times per day: morning to plan, throughout the day to reschedule as reality drifts from the plan, evening to set up tomorrow. State of mind ranges from focused (planning) to mildly frustrated (replanning when something overran). Single-user means design choices can be opinionated and idiosyncratic; they do not have to onboard strangers.

## Product Purpose

Kairos turns a todo list into a day. Tasks live on a vertical day schedule (Google-Calendar-style), not a flat list. The signature loop: add a task with a duration, it renders as a time block, drag to reschedule when reality changes, see the best free slots in the side panel. Success is the user reaching for Kairos daily instead of a notes app or Google Calendar when planning the day. The point of being public and open-source is "this is my tool, built the way I want one to feel", not adoption metrics.

## Brand Personality

Three words: **quiet, precise, opinionated.** A tool with a point of view, not a customizable shell. Confident enough to skip features competitors include (no recurring tasks, no integrations, no calendars-other-than-today) and to commit to one viewpoint on what scheduling should feel like. Personality shows up in micro-details (how a block snaps, how hours are typeset, how the now-line behaves), not in loud color, mascots, or marketing copy. Closer to Things.app or Linear in voice than to Asana or Notion. The app should feel like a single-person studio's pet project, because it is.

## Anti-references

- **Generic SaaS / Next.js-template look.** Soft slate + blue accent + rounded cards is the default the world is full of. This is the explicit thing being rejected.
- **Notion-Calendar / Cron literal clones.** Those are the reference category, but a direct copy would be forgettable. Borrow the rigor, not the surface.
- **"Productivity dashboard" aesthetic.** Big number tiles, progress rings, streak counters, dopamine-loop UI. Kairos is not a habit tracker.
- **Decorative AI-era flourishes.** Gradient text, glassmorphism, neon-on-black, animated mesh gradients, hero-metric template, side-stripe alert cards.
- **Flat, equal-weight hierarchy.** Everything competing for attention at the same scale. The day grid is the hero; everything else is staff.

## Design Principles

1. **The schedule is the hero.** Every other surface (date toolbar, add-task form, free-slots panel, header) exists to serve the day grid. Chrome must not compete with content.
2. **Quiet on rest, expressive on touch.** Static views feel typographic and restrained. Personality lives in the moment of interaction: how a block lifts when grabbed, how a free slot reveals itself, how the now-line behaves.
3. **Type carries the weight color used to.** A confident type system (size, weight, tabular numerals, deliberate tracking) does the work before color is invoked. Color is a scalpel, not a paintbrush.
4. **Single user means single point of view.** No theme picker explosion, no accessibility customization knobs beyond OS-level respect. Commit to defaults. The one settings room that exists (`/settings`, reached by the corner gear) is for *data the user owns*, labels and their time budgets, not for configuring the app's behavior. It honors the spirit of "no settings panel" by staying a flat, typographic, single-column room with no SaaS settings sprawl, rather than the literal absence of a settings route.
5. **The DB enforces correctness; the UI enforces calm.** No-overlap is a Postgres constraint, not a modal warning. Free-slots are SQL, not anxious JS. The system is quietly correct; the UI only surfaces what the user needs to feel.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor: contrast, focus visibility, keyboard reach, semantic HTML. Respect `prefers-reduced-motion` for all transitions including the drag-to-reschedule motion. Color is never the sole carrier of meaning (blocks, free slots, now-line all carry shape, position, and text). Keyboard reach to every interactive element including the drag handle. No screen-reader-specific persona work beyond standard semantics, since the only user is sighted.

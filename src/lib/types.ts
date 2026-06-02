export type BlockSource = "kairos" | "gcal";

export type RecurrenceKind = "daily" | "weekdays" | "weekly" | "interval";

export interface RecurrenceSpec {
  kind: RecurrenceKind;
  /** Only used when kind === "interval". The N in "every N days", >= 2. */
  intervalDays?: number;
}

export interface ScheduledBlock {
  id: string;
  taskId: string | null;
  source: BlockSource;
  startUtc: string; // ISO-8601 UTC
  endUtc: string; // ISO-8601 UTC
  title: string; // task title, or the event summary for gcal blocks
  tags: string[]; // task labels (normalized); the calendar's label for gcal
  /** Non-null when this block is one occurrence of a recurring series. */
  seriesId: string | null;
  /** The recurrence kind on this occurrence's task row, if part of a series. */
  recurrenceKind: RecurrenceKind | null;
  /** The calendar a gcal block came from; null for kairos blocks. */
  calendarId: string | null;
}

/**
 * An attached Google calendar. Events sync read-only into scheduled_blocks as
 * `source='gcal'` rows wearing this calendar's `label`. `lastSyncedAt` is null
 * until the first successful sync; `lastSyncError` holds the most recent failure
 * (cleared on the next success).
 */
export interface Calendar {
  id: string;
  name: string;
  icsUrl: string;
  label: string;
  enabled: boolean;
  /** When false, the calendar stays synced (and busy for free-slots) but its
   *  events are not drawn on the grid. A view declutter, lighter than `enabled`. */
  showOnGrid: boolean;
  position: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface FreeSlot {
  startUtc: string;
  endUtc: string;
  minutes: number;
}

/** The base period a label budget is expressed in. The budget view re-bases it
 *  to whatever range is on screen (see src/lib/budgets.ts). */
export type BudgetPeriod = "day" | "week" | "month" | "quarter";

/**
 * A registered label. `tags` on a task stay free-text; this is the optional
 * managed overlay. A label is "tracked" when it carries a budget — both
 * `budgetHours` and `budgetPeriod` are non-null together, or both null.
 */
export interface Label {
  slug: string;
  budgetHours: number | null;
  budgetPeriod: BudgetPeriod | null;
}

export interface DaySchedule {
  date: string; // yyyy-mm-dd
  dayStartUtc: string;
  dayEndUtc: string;
  blocks: ScheduledBlock[];
  freeSlots: FreeSlot[];
}

/**
 * A day-divider. Scalar: just a wall-clock time + a label. Renders as a thin
 * horizontal line across the day grid. The model is effective-dated daily:
 * the same checkpoint may carry different times on different dates (see
 * `src/server/checkpoints.ts`). What the day view receives is already resolved
 * to the active rule for that date.
 */
export interface Checkpoint {
  id: string;
  label: string;
  /** Wall-clock time-of-day, "HH:MM" (24h). */
  at: string;
}
